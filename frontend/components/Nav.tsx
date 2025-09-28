import Link from "next/link";

const Nav = () => {
    return (
        <nav className="flex space-x-6">
            <Link 
                href="/Caregiver" 
                className="px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white font-semibold tracking-wide hover:bg-cyan-500/20 hover:border-cyan-300/40 hover:text-cyan-100 hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 transform hover:scale-105"
                style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
                Caregiver
            </Link>
            <Link 
                href="/ar" 
                className="px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white font-semibold tracking-wide hover:bg-cyan-500/20 hover:border-cyan-300/40 hover:text-cyan-100 hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 transform hover:scale-105"
                style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
                AR Recognition
            </Link>
        </nav>
    );
};

export default Nav;