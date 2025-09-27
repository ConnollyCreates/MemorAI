import Header from "../../components/Header";
import Footer from "../../components/footer";

export default function Caregiver() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 via-sky-800 to-cyan-600">
      <Header />
      
      <main className="flex-grow p-6">
        {/* Page Title */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
            Caregiver Dashboard
          </h1>
          <p className="text-xl text-cyan-100 font-light">
            Help your loved ones remember important people and moments
          </p>
        </div>

        <div className="max-w-7xl mx-auto">
          {/* First row */}
          <div className="flex justify-center items-center gap-12 mb-8">
            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 flex items-center justify-center h-24 hover:bg-white/15 transition-all duration-300">
              <h2 className="text-xl font-semibold text-white">Name</h2>
            </div>

            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 hover:bg-white/15 transition-all duration-300">
              <div className="h-36 bg-white/5 rounded-lg border-2 border-dashed border-cyan-300/50 flex items-center justify-center hover:border-cyan-300/80 transition-colors duration-300">
                <div className="text-center">
                  <p className="text-cyan-200 font-medium mb-2">Upload Photo</p>
                  <p className="text-xs text-cyan-300/80">Drag & drop or click to browse</p>
                </div>
              </div>
            </div>
          </div>

          {/* Second row */}
          <div className="flex justify-center items-center gap-12 mb-8">
            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 flex items-center justify-center h-24 hover:bg-white/15 transition-all duration-300">
              <h2 className="text-xl font-semibold text-white">Relationship</h2>
            </div>

            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 hover:bg-white/15 transition-all duration-300">
              <div className="h-36 bg-white/5 rounded-lg border-2 border-dashed border-cyan-300/50 flex items-center justify-center hover:border-cyan-300/80 transition-colors duration-300">
                <div className="text-center">
                  <p className="text-cyan-200 font-medium mb-2">Upload Photo</p>
                  <p className="text-xs text-cyan-300/80">Drag & drop or click to browse</p>
                </div>
              </div>
            </div>
          </div>

          {/* Third row */}
          <div className="flex justify-center items-center gap-12 mb-8">
            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 flex items-center justify-center h-24 hover:bg-white/15 transition-all duration-300">
              <h2 className="text-xl font-semibold text-white">Activity</h2>
            </div>

            <div className="w-80 bg-white/10 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6 hover:bg-white/15 transition-all duration-300">
              <div className="h-36 bg-white/5 rounded-lg border-2 border-dashed border-cyan-300/50 flex items-center justify-center hover:border-cyan-300/80 transition-colors duration-300">
                <div className="text-center">
                  <p className="text-cyan-200 font-medium mb-2">Upload Photo</p>
                  <p className="text-xs text-cyan-300/80">Drag & drop or click to browse</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-6 mt-12">
            <button className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full text-white font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 transform hover:scale-105 shadow-lg">
              Save Profile
            </button>
            <button className="px-8 py-3 border-2 border-white/30 rounded-full text-white font-semibold hover:bg-white/10 transition-all duration-300">
              Preview
            </button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
