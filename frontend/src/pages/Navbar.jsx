import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HiMenuAlt3, HiX } from "react-icons/hi";
import { FiCpu, FiArrowRight } from "react-icons/fi";

const navLinks = ["Home", "Features", "FAQ", "Contact"];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState("Home");
  const [hoveredLink, setHoveredLink] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (link) => {
    setMenuOpen(false);
    setActiveLink(link);
    if (link === "Home") { navigate("/"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const sectionId = link.toLowerCase();
    if (location.pathname === "/") {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => { const el = document.getElementById(sectionId); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 350);
    }
  };

  return (
    <motion.nav initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? "backdrop-blur-2xl border-b border-white/8" : "backdrop-blur-sm"}`}
      style={{ background: scrolled ? "rgba(5,5,10,0.88)" : "transparent", boxShadow: scrolled ? "0 4px 40px rgba(124,92,255,0.12)" : "none" }}>

      {/* Top shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
        <motion.div className="h-full" style={{ background: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF)" }}
          initial={{ scaleX: 0 }} animate={{ scaleX: scrolled ? 1 : 0 }}
          transition={{ duration: 0.5 }} />
        {scrolled && (
          <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)", width: "25%" }} />
        )}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <motion.div onClick={() => handleNavClick("Home")}
          className="flex items-center gap-3 cursor-pointer group"
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
          <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
            animate={{ boxShadow: ["0 0 15px rgba(124,92,255,0.45)", "0 0 30px rgba(0,224,255,0.45)", "0 0 15px rgba(124,92,255,0.45)"] }}
            transition={{ duration: 3, repeat: Infinity }}
            whileHover={{ boxShadow: "0 0 40px rgba(124,92,255,0.9)", rotate: [0, -6, 6, 0] }}>
            <motion.div className="absolute inset-0"
              animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)" }} />
            <FiCpu className="text-white text-base relative z-10" />
          </motion.div>
          <span className="text-white font-black text-lg tracking-tight">
            <motion.span style={{ color: "#7C5CFF" }}
              animate={{ color: ["#7C5CFF", "#9B79FF", "#7C5CFF"] }} transition={{ duration: 3.5, repeat: Infinity }}>Agentic</motion.span>
            <motion.span style={{ color: "#00E0FF" }}
              animate={{ color: ["#00E0FF", "#4DFDFF", "#00E0FF"] }} transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}>IQ</motion.span>
          </span>
        </motion.div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link, i) => {
            const isActive = activeLink === link;
            const isHovered = hoveredLink === link;
            return (
              <motion.button key={link} onClick={() => handleNavClick(link)}
                initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.3, duration: 0.5 }}
                whileHover={{ y: -2 }}
                onHoverStart={() => setHoveredLink(link)}
                onHoverEnd={() => setHoveredLink(null)}
                className="relative px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-lg"
                style={{ color: isActive ? "#fff" : isHovered ? "#E6E6EB" : "#9CA3AF" }}>
                {isActive && (
                  <motion.div layoutId="activeNav" className="absolute inset-0 rounded-lg"
                    style={{ background: "rgba(124,92,255,0.14)", boxShadow: "inset 0 1px 0 rgba(124,92,255,0.3)" }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.5 }} />
                )}
                {isHovered && !isActive && (
                  <motion.div className="absolute inset-0 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                )}
                <span className="relative z-10">{link}</span>
                {isActive && (
                  <motion.div layoutId="activeNavDot"
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: "#7C5CFF", boxShadow: "0 0 6px #7C5CFF" }} />
                )}
                {isHovered && (
                  <motion.div className="absolute bottom-0 left-2 right-2 h-px rounded-full"
                    style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,transparent)" }}
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.25 }} />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          <motion.button onClick={() => navigate("/login")}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.05, borderColor: "rgba(124,92,255,0.55)", backgroundColor: "rgba(124,92,255,0.06)", boxShadow: "0 0 20px rgba(124,92,255,0.2)" }}
            whileTap={{ scale: 0.97 }}
            className="px-5 py-2 text-sm text-[#E6E6EB] border border-white/15 rounded-xl transition-all duration-280">
            Login
          </motion.button>
          <motion.button onClick={() => navigate("/signup")}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.06, boxShadow: "0 0 35px rgba(124,92,255,0.75)" }}
            whileTap={{ scale: 0.96 }}
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl flex items-center gap-1.5 overflow-hidden relative"
            style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
            <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
            <motion.div className="absolute inset-0" animate={{ opacity: [0, 0.12, 0] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              style={{ background: "radial-gradient(circle at 50% 0%,rgba(255,255,255,0.6),transparent 65%)" }} />
            <span className="relative">Get Started</span>
            <motion.span className="relative" animate={{ x: [0, 3, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
              <FiArrowRight size={14} />
            </motion.span>
          </motion.button>
        </div>

        {/* Mobile hamburger */}
        <motion.button onClick={() => setMenuOpen(!menuOpen)}
          whileHover={{ scale: 1.1, borderColor: "rgba(124,92,255,0.5)" }} whileTap={{ scale: 0.9 }}
          className="md:hidden w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center text-[#E6E6EB] transition-all">
          <AnimatePresence mode="wait">
            {menuOpen ? (
              <motion.span key="x" initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.22 }}><HiX size={18} /></motion.span>
            ) : (
              <motion.span key="menu" initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.22 }}><HiMenuAlt3 size={18} /></motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden border-t border-white/8 relative"
            style={{ background: "rgba(5,5,10,0.96)", backdropFilter: "blur(28px)" }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg,transparent,#7C5CFF50,transparent)" }} />
            <div className="flex flex-col px-6 py-5 gap-1">
              {navLinks.map((link, i) => (
                <motion.button key={link}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => handleNavClick(link)}
                  whileHover={{ x: 6, color: "#fff" }}
                  className="text-[#9CA3AF] py-3 text-sm font-medium text-left border-b border-white/5 last:border-0 transition-colors flex items-center gap-2 group">
                  <motion.div className="w-1 h-1 rounded-full bg-[#7C5CFF] opacity-0 group-hover:opacity-100 transition-opacity" />
                  {link}
                </motion.button>
              ))}
              <div className="flex gap-3 pt-4">
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  onClick={() => { setMenuOpen(false); navigate("/login"); }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 text-sm text-[#E6E6EB] border border-white/15 rounded-xl hover:bg-white/5 hover:border-white/30 transition-all">
                  Login
                </motion.button>
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  onClick={() => { setMenuOpen(false); navigate("/signup"); }}
                  whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(124,92,255,0.5)" }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 text-sm font-semibold text-white rounded-xl relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
                  <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
                  <span className="relative">Sign Up</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}