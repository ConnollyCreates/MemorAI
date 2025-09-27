"use client";

import Header from "../../components/Header";
import Footer from "../../components/footer";
import { useState } from "react";

export default function Caregiver() {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files: File[] = Array.from(e.target.files ?? []);
    console.log("Selected files:", files);

    // Convert files to URLs and add to selectedImages
    const newImageUrls = files.map((file) => URL.createObjectURL(file));
    setSelectedImages((prev) => [...prev, ...newImageUrls]);
  };

  const removeImage = (index: number): void => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 via-sky-800 to-cyan-600">
      <Header />

      <main className="flex-grow p-6">
        {/* Page Title */}
        <div className="text-center mb-10 px-4">
          <h1 className="text-5xl md:text-6xl font-bold mb-10 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent leading-tight">
            Caregiver Dashboard
          </h1>
          <p className="text-xl text-cyan-100 font-light">
            Help your loved ones remember important people and moments
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Single Large Upload Box */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 hover:bg-white/15 transition-all duration-300">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Upload Person Information
              </h2>
              <p className="text-cyan-200 text-lg">
                Add photos and details to help with recognition
              </p>
            </div>

            <div className="relative">
              <input
                type="file"
                id="file-upload"
                multiple
                accept="image/jpeg,image/png,image/gif"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleFileUpload}
              />
              <div className="h-96 bg-white/5 rounded-xl border-3 border-dashed border-cyan-300/50 flex items-center justify-center hover:border-cyan-300/80 transition-colors duration-300 mb-8 cursor-pointer">
                <div className="text-center">
                  <div className="mb-6">
                    <svg
                      className="w-16 h-16 text-cyan-200 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      ></path>
                    </svg>
                  </div>
                  <p className="text-2xl text-cyan-200 font-semibold mb-3">
                    Upload Photos
                  </p>
                  <p className="text-lg text-cyan-300/80 mb-2">
                    Drag & drop multiple photos here
                  </p>
                  <p className="text-sm text-cyan-300/60">
                    or click to browse your files
                  </p>
                  <p className="text-xs text-cyan-300/40 mt-4">
                    Supports: JPG, PNG, GIF • Max 10MB each
                  </p>
                </div>
              </div>
            </div>

            {/* Image Preview Section */}
            {selectedImages.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Uploaded Images ({selectedImages.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedImages.map((imageUrl, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={imageUrl}
                        alt={`Uploaded image ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-white/20"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold transition-colors duration-200 opacity-0 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Fields Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <label className="block text-cyan-200 font-medium mb-2">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="Enter person's name"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <label className="block text-cyan-200 font-medium mb-2">
                  Relationship
                </label>
                <input
                  type="text"
                  placeholder="e.g., Son, Daughter, Friend"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <label className="block text-cyan-200 font-medium mb-2">
                  Activity/Notes
                </label>
                <input
                  type="text"
                  placeholder="Favorite activities together"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-6 mt-12">
            <button className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full text-white font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 transform hover:scale-105 shadow-lg text-lg">
              Save Profile
            </button>
            <button className="px-10 py-4 border-2 border-white/30 rounded-full text-white font-semibold hover:bg-white/10 transition-all duration-300 text-lg">
              Preview
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
