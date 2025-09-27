import Logo from "./Logo";
import Nav from "./Nav";

const Header = () => {
    return(
        <header className="bg-black/20 backdrop-blur-md z-[20] mx-auto flex w-full items-center justify-between p-6">
            <Logo />
            <Nav />
        </header>
    );
};

export default Header;