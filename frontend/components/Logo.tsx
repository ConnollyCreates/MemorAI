import Link from "next/link";

const Logo = () => {
    return (
        <Link href="/" className="logo h-20 w-20 block hover:scale-105 transition-transform duration-300 cursor-pointer">
            <img src="/memorai2.png" alt="MemorAI logo" className="h-full w-full object-contain" />
        </Link>
    );
};

export default Logo;