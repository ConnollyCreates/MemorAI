import Link from "next/link";

const Nav = () => {
    return (
        <div className ="w-20">
        <Link href="/caregiver" className="hover:text-blue-500 transition-colors">
            Caregiver
        </Link>
        </div>
    );
};

export default Nav;