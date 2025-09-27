import Header from "../../components/Header";
import Footer from "../../components/footer";

export default function About() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 via-sky-800 to-cyan-600">
      <Header />
      
      <main className="flex-grow p-6">
        {/* Page Title */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
            About MemorAI
          </h1>
          <p className="text-xl text-cyan-100 font-light max-w-3xl mx-auto">
            Empowering people with Alzheimer's to maintain meaningful connections through advanced AI technology
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Mission Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 mb-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-6">Our Mission</h2>
              <p className="text-lg text-cyan-100 leading-relaxed max-w-4xl mx-auto">
                MemorAI bridges the gap between technology and compassion, helping individuals with Alzheimer's 
                disease recognize and remember their loved ones through real-time facial recognition and augmented reality. 
                We believe that maintaining human connections is fundamental to dignity and quality of life.
              </p>
            </div>
          </div>

          {/* How It Works Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 mb-8">
            <h2 className="text-3xl font-semibold text-white mb-8 text-center">How MemorAI Works</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-cyan-500/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">1. Upload Photos</h3>
                <p className="text-cyan-200">Caregivers upload photos of important people with names and relationships</p>
              </div>

              <div className="text-center">
                <div className="bg-cyan-500/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">2. AI Learning</h3>
                <p className="text-cyan-200">Our AI system learns and processes facial features for accurate recognition</p>
              </div>

              <div className="text-center">
                <div className="bg-cyan-500/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">3. Real-time Recognition</h3>
                <p className="text-cyan-200">Camera identifies faces and displays helpful information in real-time</p>
              </div>
            </div>
          </div>

          {/* Impact Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 mb-8">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-white mb-6">Making a Difference</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-2xl font-bold text-cyan-300 mb-2">For Patients</h3>
                  <p className="text-cyan-100">
                    Maintain independence and confidence by recognizing family members, friends, and caregivers. 
                    Reduce anxiety and confusion in social situations.
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-2xl font-bold text-cyan-300 mb-2">For Families</h3>
                  <p className="text-cyan-100">
                    Peace of mind knowing your loved one can identify important people. 
                    Maintain meaningful relationships and create positive interactions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Technology Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-white mb-6">Powered by Advanced Technology</h2>
              <div className="flex flex-wrap justify-center gap-4 mt-6">
                <span className="px-4 py-2 bg-cyan-500/20 rounded-full text-cyan-200 font-medium">Facial Recognition AI</span>
                <span className="px-4 py-2 bg-cyan-500/20 rounded-full text-cyan-200 font-medium">Augmented Reality</span>
                <span className="px-4 py-2 bg-cyan-500/20 rounded-full text-cyan-200 font-medium">Real-time Processing</span>
                <span className="px-4 py-2 bg-cyan-500/20 rounded-full text-cyan-200 font-medium">Cloud Storage</span>
                <span className="px-4 py-2 bg-cyan-500/20 rounded-full text-cyan-200 font-medium">Privacy-First Design</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
