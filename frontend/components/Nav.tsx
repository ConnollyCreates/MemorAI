import Link from "next/link";

const Nav = () => {
    return (
        <nav className="flex space-x-6">
            <Link href="/Caregiver" className="text-white/90 hover:text-cyan-200 transition-colors duration-300 font-medium">
                Caregiver
            </Link>
        </nav>
    );
};

export default Nav;