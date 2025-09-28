"""
Firestore Service for CV/Face Recognition
Connects to Firestore using REST API to fetch patient data when faces are recognized
"""

import os
import time
import json
import requests
from datetime import datetime
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt
from dotenv import load_dotenv

def _load_env_from_known_locations():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, ".env"),                 # cv-service/.env
        os.path.join(here, "../backend/.env"),      # backend/.env
        os.path.join(here, "../.env"),              # repo root .env
    ]
    for p in candidates:
        if os.path.exists(p):
            load_dotenv(dotenv_path=p)
            print(f"[env] loaded dotenv from {os.path.abspath(p)}")
            return os.path.abspath(p)
    # fallback to default env
    print("[env] no dotenv file found in known locations; relying on process env")
    return None

# Load environment variables once at import
_ENV_PATH = _load_env_from_known_locations()

class FirestoreService:
    def __init__(self):
        self.access_token = None
        self.token_expires_at = 0

        # simple in-memory caches
        self._person_cache = {}  # name -> {"data": dict, "ts": epoch_sec}
        self._people_list_cache = {"data": None, "ts": 0}
        # TTLs
        self.person_ttl_sec = int(os.getenv("FIRESTORE_PERSON_TTL_SEC", "300"))
        self.people_list_ttl_sec = int(os.getenv("FIRESTORE_PEOPLE_TTL_SEC", "300"))
        # credentials
        self.project_id = os.getenv('FIREBASE_PROJECT_ID')
        self.client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
        self.private_key = os.getenv('FIREBASE_PRIVATE_KEY')
        self.base_url = None
        # SSL config
        self._verify_ssl = os.getenv("REQUESTS_VERIFY", "1") not in ("0", "false", "False")
        self._ca_bundle = os.getenv("REQUESTS_CA_BUNDLE") or os.getenv("CURL_CA_BUNDLE")
        if os.getenv("CV_INSECURE_SKIP_VERIFY", "0") in ("1", "true", "True"):
            self._verify_ssl = False

        # Build 'verify' param to pass to requests
        self._verify_param = self._ca_bundle if (self._verify_ssl and self._ca_bundle) else self._verify_ssl

        # Validate environment variables
        if not all([self.project_id, self.client_email, self.private_key]):
            raise ValueError("Missing Firebase credentials in environment variables")
        
        self.base_url = f"https://firestore.googleapis.com/v1/projects/{self.project_id}/databases/(default)/documents"
        print(f"✓ Firebase CV Service initialized for project: {self.project_id}")
    
    def get_access_token(self):
        """Generate JWT token and exchange for access token"""
        try:
            # Check if current token is still valid
            if self.access_token and time.time() < self.token_expires_at:
                return self.access_token
            
            # Create JWT token
            now = int(time.time())
            payload = {
                'iss': self.client_email,
                'scope': 'https://www.googleapis.com/auth/datastore',
                'aud': 'https://oauth2.googleapis.com/token',
                'exp': now + 3600,  # 1 hour
                'iat': now
            }
            
            # Clean up private key
            private_key = self.private_key.replace('\\n', '\n').strip('"')
            
            # Sign JWT
            token = jwt.encode(payload, private_key, algorithm='RS256')
            
            # Exchange JWT for access token
            response = requests.post('https://oauth2.googleapis.com/token', data={
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': token
            }, timeout=20, verify=self._verify_param)
            
            if response.status_code == 200:
                token_data = response.json()
                self.access_token = token_data['access_token']
                self.token_expires_at = now + 3500  # Refresh 5 minutes before expiry
                print("✅ Firebase access token obtained successfully")
                return self.access_token
            else:
                raise Exception(f"Token request failed: {response.status_code} - {response.text}")
        
        except Exception as e:
            print(f"❌ Error getting Firebase access token: {e}")
            raise e
    
    def get_person_data(self, person_name: str, bypass_cache: bool = False):
        """
        Fetch person data and their photos from Firestore
        Returns: dict with person info and photos, or None if not found
        """
        try:
            now = time.time()
            # cache hit
            cached = self._person_cache.get(person_name)
            if not bypass_cache and cached and (now - cached["ts"]) < self.person_ttl_sec:
                return cached["data"]

            print(f"🔍 Looking up person (cache miss): {person_name}")
            
            access_token = self.get_access_token()
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Get person document
            person_url = f"{self.base_url}/people/{person_name}"
            t0 = time.time()
            person_response = requests.get(person_url, headers=headers, timeout=20, verify=self._verify_param)
            
            if person_response.status_code == 404:
                print(f"❌ Person '{person_name}' not found in database")
                return None
            
            if person_response.status_code != 200:
                print(f"❌ Error fetching person data: {person_response.status_code}")
                return None
            
            person_data = person_response.json()
            
            # Get person's photos
            photos_url = f"{self.base_url}/people/{person_name}/photos"
            photos_response = requests.get(photos_url, headers=headers, timeout=20, verify=self._verify_param)
            
            photos = []
            if photos_response.status_code == 200:
                photos_data = photos_response.json()
                if 'documents' in photos_data:
                    for doc in photos_data['documents']:
                        fields = doc['fields']
                        photo = {
                            'id': doc['name'].split('/')[-1],
                            'photoURL': fields.get('photoURL', {}).get('stringValue', ''),
                            'photoDescription': fields.get('photoDescription', {}).get('stringValue', ''),
                            'uploadedAt': fields.get('uploadedAt', {}).get('timestampValue', '')
                        }
                        photos.append(photo)
            
            # Extract person fields
            fields = person_data.get('fields', {})
            result = {
                'name': person_name,
                'relation': fields.get('relation', {}).get('stringValue', ''),
                'photos': photos,
                'photo_count': len(photos),
                'most_recent_photo': photos[-1]['photoURL'] if photos else None,
                'updated_at': fields.get('updatedAt', {}).get('timestampValue', '')
            }
            t_ms = int((time.time() - t0) * 1000)
            print(f"✅ Found person '{person_name}' with {len(photos)} photos in {t_ms} ms")

            # update cache
            self._person_cache[person_name] = {"data": result, "ts": now}
            return result
            
        except Exception as e:
            print(f"❌ Error fetching person data for '{person_name}': {e}")
            return None
    
    def get_all_people(self, bypass_cache: bool = False):
        """
        Get list of all people in the database
        Returns: list of person names
        """
        try:
            now = time.time()
            if not bypass_cache and self._people_list_cache["data"] is not None and (now - self._people_list_cache["ts"]) < self.people_list_ttl_sec:
                return self._people_list_cache["data"]

            print("🔍 Fetching all people from database (cache miss)")
            
            access_token = self.get_access_token()
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            people_url = f"{self.base_url}/people"
            t0 = time.time()
            response = requests.get(people_url, headers=headers, timeout=20, verify=self._verify_param)
            
            if response.status_code == 200:
                data = response.json()
                people = []
                if 'documents' in data:
                    for doc in data['documents']:
                        person_name = doc['name'].split('/')[-1]
                        people.append(person_name)
                
                t_ms = int((time.time() - t0) * 1000)
                print(f"✅ Found {len(people)} people in database in {t_ms} ms: {people}")
                # update cache
                self._people_list_cache = {"data": people, "ts": now}
                return people
            else:
                print(f"❌ Error fetching people list: {response.status_code}")
                return []
        
        except Exception as e:
            print(f"❌ Error fetching people list: {e}")
            return []

    def cache_stats(self):
        now = time.time()
        return {
            "person_entries": len(self._person_cache),
            "person_entries_age_sec": {k: int(now - v["ts"]) for k, v in self._person_cache.items()},
            "people_list_cached": self._people_list_cache["data"] is not None,
            "people_list_age_sec": int(now - self._people_list_cache["ts"]) if self._people_list_cache["data"] is not None else None,
            "person_ttl_sec": self.person_ttl_sec,
            "people_list_ttl_sec": self.people_list_ttl_sec,
        }

    def invalidate_caches(self):
        self._person_cache.clear()
        self._people_list_cache = {"data": None, "ts": 0}
        print("🧹 FirestoreService caches invalidated")

# Global instance
firestore_service = FirestoreService()