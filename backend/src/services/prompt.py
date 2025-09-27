import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# Get API key from environment variables  
api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    raise ValueError("GEMINI_API_KEY not found in environment variables")

print(f"✅ Found GEMINI_API_KEY in environment (length: {len(api_key)})")

# Configure the client with API key
client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model="gemini-2.0-flash-exp", 
        contents="Hello! This is a test message to verify the MemorAI GenAI integration is working correctly. Please respond with a confirmation that you received this message."
    )
    
    print("✅ GenAI Connection Successful!")
    print("📝 Response:", response.text)
    print("🎉 Your API key is working correctly!")
    
except Exception as e:
    print("❌ GenAI Connection Failed!")
    print("🚨 Error:", str(e))
    print("💡 Make sure your GEMINI_API_KEY is set correctly in your .env file")


def create_sentimental_memory(activity_text, person_name=None, relationship=None):
    """
    Takes a simple activity (like 'basketball') and creates a sentimental memory message
    
    Args:
        activity_text (str): Simple activity description (e.g., "basketball", "cooking dinner")
        person_name (str, optional): Name of the person
        relationship (str, optional): Relationship (e.g., "son", "daughter", "grandmother")
    
    Returns:
        str: Sentimental memory message suitable for recognition
    """
    
    # Build the prompt for Gemini
    prompt = f"""
    You are creating a warm, sentimental memory message for someone with Alzheimer's disease. 
    
    Activity: "{activity_text}"
    Person's name: {person_name or "Not specified"}
    Relationship: {relationship or "Not specified"}
    
    Create a short, heartfelt message (1-2 sentences) that:
    1. Starts with "Hey, this is your {relationship}" (if relationship is provided)
    2. Incorporates the activity in a warm, loving way
    3. Sounds natural and caring
    4. Is appropriate for text-to-speech
    5. Brings back positive emotions and connection
    
    Examples:
    - Activity: "basketball" + Relationship: "son" → "Hey, this is your son! Remember all those wonderful afternoons we spent playing basketball together in the backyard."
    - Activity: "cooking" + Relationship: "daughter" → "Hey, this is your daughter! We used to love cooking together, creating delicious meals and even more precious memories."
    
    Generate ONLY the sentimental message, nothing else.
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt
        )
        
        sentimental_message = response.text.strip()
        return sentimental_message
        
    except Exception as e:
        print(f"Error creating sentimental memory: {e}")
        # Fallback message if Gemini fails
        if relationship and person_name:
            return f"Hey, this is your {relationship} {person_name}! We had such wonderful times together with {activity_text}."
        elif relationship:
            return f"Hey, this is your {relationship}! Remember the great times we shared doing {activity_text} together."
        else:
            return f"What a beautiful memory of {activity_text} together!"


# Test the function
if __name__ == "__main__":
    print("\n🧪 Testing sentimental memory creation...")
    
    # Test examples
    test_cases = [
        ("basketball", "Mike", "son"),
        ("cooking dinner", "Sarah", "daughter"),
        ("gardening", "Rose", "grandmother"),
        ("playing piano", None, "friend"),
        ("Volleyball on beach", "Chris", "son"),
    ]
    
    for activity, name, relationship in test_cases:
        print(f"\n📝 Activity: {activity}")
        print(f"👤 Person: {name}, Relationship: {relationship}")
        message = create_sentimental_memory(activity, name, relationship)
        print(f"💝 Sentimental Message: {message}")
        print("-" * 50)
