import { useState } from 'react';

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <div className="md:hidden">
      {/* Hamburger Button */}
      <button
        onClick={toggleMenu}
        className="flex flex-col cursor-pointer z-[1001]"
        aria-label="Toggle menu"
      >
        <span className={`w-6 h-0.5 bg-primary mb-1 transition-all ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
        <span className={`w-6 h-0.5 bg-primary mb-1 transition-all ${isOpen ? 'opacity-0' : ''}`}></span>
        <span className={`w-6 h-0.5 bg-primary transition-all ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
      </button>

      {/* Mobile Menu */}
      <ul className={`fixed ${isOpen ? 'left-0' : '-left-full'} top-[70px] flex flex-col bg-white w-full text-center transition-all duration-300 shadow-lg py-5 space-y-4 list-none`}>
        <li><a href="/" onClick={closeMenu} className="text-primary no-underline text-sm tracking-wide">Home</a></li>
        <li><a href="/accommodations" onClick={closeMenu} className="text-primary no-underline text-sm tracking-wide">Accommodations</a></li>
        <li><a href="/gallery" onClick={closeMenu} className="text-primary no-underline text-sm tracking-wide">Gallery</a></li>
        <li><a href="/contact" onClick={closeMenu} className="text-primary no-underline text-sm tracking-wide">Contact</a></li>
        <li><a href="/location" onClick={closeMenu} className="text-primary no-underline text-sm tracking-wide">Location</a></li>
        <li className="flex justify-center gap-4 py-2">
          <button className="text-primary hover:text-accent transition-colors font-medium">TH</button>
          <span className="text-gray-300">|</span>
          <button className="text-text-light hover:text-accent transition-colors">EN</button>
        </li>
        <li><a href="/reservations" onClick={closeMenu} className="btn-reserve">Reserve</a></li>
      </ul>
    </div>
  );
}
