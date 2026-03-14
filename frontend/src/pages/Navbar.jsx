import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HiMenuAlt3, HiX } from "react-icons/hi";
import { FiCpu } from "react-icons/fi";

const navLinks = ["Home", "Features", "FAQ", "Contact"];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ──────────────────────────────────────────
     handleNavClick logic:
     - "Home"  → navigate("/") + scroll top
     - others  → if already on "/", scroll to section
                 if on another page, navigate("/") then
                 scroll after 300ms (page render delay)
  ────────────────────────────────────────── */
  const handleNavClick = (link) => {
    setMenuOpen(false);

    if (link === "Home") {
      navigate("/");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const sectionId = link.toLowerCase();

    if (location.pathname === "/") {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        scrolled
          ? "backdrop-blur-2xl bg-[#0B0B0F]/80 border-b border-white/10 shadow-[0_4px_40px_rgba(124,92,255,0.15)]"
          : "backdrop-blur-md bg-white/5 border-b border-white/5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <motion.div
          onClick={() => handleNavClick("Home")}
          className="flex items-center gap-3 cursor-pointer group"
          whileHover={{ scale: 1.03 }}
        >
          <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#7C5CFF] to-[#00E0FF] flex items-center justify-center shadow-[0_0_20px_rgba(124,92,255,0.6)] group-hover:shadow-[0_0_30px_rgba(124,92,255,0.9)] transition-all duration-300">
            <FiCpu className="text-white text-base" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            <span className="text-[#7C5CFF]">Agentic</span>
            <span className="text-[#00E0FF]">IQ</span>
          </span>
        </motion.div>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link, i) => (
            <motion.button
              key={link}
              onClick={() => handleNavClick(link)}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.3 }}
              className="relative px-4 py-2 text-[#9CA3AF] hover:text-white text-sm font-medium transition-colors duration-200 group cursor-pointer"
            >
              {link}
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] group-hover:w-4/5 transition-all duration-300 rounded-full" />
            </motion.button>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <motion.button
            onClick={() => navigate("/login")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="px-5 py-2 text-sm text-[#E6E6EB] border border-white/15 rounded-xl hover:border-[#7C5CFF]/60 hover:bg-[#7C5CFF]/10 hover:text-white transition-all duration-300"
          >
            Login
          </motion.button>
          <motion.button
            onClick={() => navigate("/signup")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(124,92,255,0.6)" }}
            whileTap={{ scale: 0.96 }}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.4)] transition-all duration-300"
          >
            Sign Up
          </motion.button>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-[#E6E6EB] text-2xl"
        >
          {menuOpen ? <HiX /> : <HiMenuAlt3 />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="md:hidden overflow-hidden bg-[#111118]/95 backdrop-blur-xl border-t border-white/10"
          >
            <div className="flex flex-col px-6 py-4 gap-3">
              {navLinks.map((link) => (
                <button
                  key={link}
                  onClick={() => handleNavClick(link)}
                  className="text-[#9CA3AF] hover:text-white py-2 text-sm font-medium border-b border-white/5 transition-colors text-left"
                >
                  {link}
                </button>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setMenuOpen(false); navigate("/login"); }}
                  className="flex-1 py-2 text-sm text-[#E6E6EB] border border-white/15 rounded-xl hover:border-[#7C5CFF]/60 transition-all"
                >
                  Login
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/signup"); }}
                  className="flex-1 py-2 text-sm font-semibold text-white rounded-xl bg-linear-to-r from-[#7C5CFF] to-[#00E0FF]"
                >
                  Sign Up
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}