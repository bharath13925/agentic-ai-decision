import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FaGithub, FaLinkedin, FaInstagram } from "react-icons/fa";
import { FiCpu } from "react-icons/fi";
import { MdEmail } from "react-icons/md";

export default function Footer() {
  const navigate = useNavigate();

  const socials = [
    { icon: <FaGithub />, label: "GitHub",    href: "https://github.com/bharath13925" },
    { icon: <FaLinkedin />, label: "LinkedIn", href: "https://www.linkedin.com/in/bandi-bharath-a3a97b2a3/" },
    { icon: <FaInstagram />, label: "Instagram", href: "https://www.instagram.com/bharath_13925/" },
  ];

  const legalLinks = [
    { label: "Privacy Policy",     path: "/privacy" },
    { label: "Terms & Conditions", path: "/terms" },
    { label: "Support",            path: "/support" },
  ];

  return (
    <footer className="relative border-t border-white/10 bg-[#0B0B0F] overflow-hidden">
      {/* Glow top edge */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150 h-px bg-linear-to-r from-transparent via-[#7C5CFF]/60 to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-75 h-10 bg-[#7C5CFF]/10 blur-2xl" />

      <div className="max-w-7xl mx-auto px-6 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">

          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#7C5CFF] to-[#00E0FF] flex items-center justify-center shadow-[0_0_20px_rgba(124,92,255,0.5)]">
                <FiCpu className="text-white text-base" />
              </div>
              <span className="text-white font-bold text-lg">
                <span className="text-[#7C5CFF]">Agentic</span>
                <span className="text-[#00E0FF]">IQ</span>
              </span>
            </div>
            <p className="text-[#9CA3AF] text-sm leading-relaxed max-w-sm mb-6">
              Agentic AI Decision Intelligence Platform — empowering smarter
              business decisions through multi-agent ML workflows powered by
              XGBoost, LightGBM, and SHAP explainability.
            </p>

            <div className="flex flex-col gap-2 mb-6">
              <a
                href="mailto:contact@agenticiq.ai"
                className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#00E0FF] text-sm transition-colors duration-200"
              >
                <MdEmail className="text-[#00E0FF]" />
                bharathbandi13925@gmail.com
              </a>
            </div>

            {/* Socials */}
            <div className="flex gap-3">
              {socials.map(({ icon, label, href }) => (
                <motion.a
                  key={label}
                  href={href}
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  aria-label={label}
                  className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-[#9CA3AF] hover:text-white hover:border-[#7C5CFF]/60 hover:bg-[#7C5CFF]/15 hover:shadow-[0_0_15px_rgba(124,92,255,0.4)] transition-all duration-300"
                >
                  {icon}
                </motion.a>
              ))}
            </div>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-white text-sm font-semibold mb-4 tracking-wider uppercase">
              Legal
            </h4>
            <ul className="flex flex-col gap-3">
              {legalLinks.map(({ label, path }) => (
                <li key={label}>
                  <button
                    onClick={() => navigate(path)}
                    className="text-[#9CA3AF] hover:text-[#7C5CFF] text-sm transition-colors duration-200 text-left"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-linear-to-r from-transparent via-white/10 to-transparent mb-6" />

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[#9CA3AF] text-xs">
            © AgenticIQ. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {legalLinks.map(({ label, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="text-[#9CA3AF] hover:text-[#7C5CFF] text-xs transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}