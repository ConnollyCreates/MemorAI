import Header from "../components/Header";
import Footer from "../components/footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 via-sky-800 to-cyan-600">
      <Header />
      <main className="flex-grow flex items-center justify-center p-8 relative">
        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-black/20"></div>
        
        <div className="relative z-10 text-center text-white max-w-4xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
            Welcome to MemorAI
          </h1>
          <p className="text-xl md:text-2xl text-cyan-100 mb-8 font-light">
            AI-powered facial recognition technology helping people with Alzheimer's remember loved ones through real-time AR assistance
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full text-white font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 transform hover:scale-105 shadow-lg">
              Get Started
            </button>
            <button className="px-8 py-3 border-2 border-white/30 rounded-full text-white font-semibold hover:bg-white/10 transition-all duration-300">
              Learn More
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
