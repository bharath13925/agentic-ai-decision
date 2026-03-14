import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { FiCpu, FiMail, FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function UserLoginForm() {
  const navigate = useNavigate();
  const location = useLocation();

  // Message passed from signup redirect
  const successMessage = location.state?.message || "";

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  /* ── Save Google user to backend if new ── */
  const saveToBackend = async (uid, name, email, provider = "google") => {
    try {
      await fetch(`${API}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, name, email, provider }),
      });
    } catch (err) {
      console.error("Backend save error:", err.message);
    }
  };

  /* ── Email / Password Login ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      const code = err.code;
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError("No account found with this email.");
      } else if (code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(err.message.replace("Firebase: ", ""));
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Google Login ── */
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      // Save to backend in case it's a new Google user
      await saveToBackend(
        cred.user.uid,
        cred.user.displayName || "User",
        cred.user.email,
        "google"
      );
      navigate("/dashboard");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-24"
      style={{
        background: `
          radial-gradient(circle at 25% 40%, #7c5cff22, transparent 55%),
          radial-gradient(circle at 75% 60%, #00e0ff1a, transparent 55%),
          #0B0B0F
        `,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#7C5CFF] to-[#00E0FF] flex items-center justify-center shadow-[0_0_20px_rgba(124,92,255,0.6)]">
            <FiCpu className="text-white text-lg" />
          </div>
          <span className="text-white font-bold text-xl">
            <span className="text-[#7C5CFF]">Agentic</span>
            <span className="text-[#00E0FF]">IQ</span>
          </span>
        </div>

        <div className="bg-white/4 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_0_60px_rgba(124,92,255,0.1)]">
          <h2 className="text-2xl font-black text-white mb-1">Welcome Back</h2>
          <p className="text-[#9CA3AF] text-sm mb-6">Login to your AgenticIQ account.</p>

          {/* Success message from signup */}
          {successMessage && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              ✓ {successMessage}
            </div>
          )}

          {/* Google */}
          <motion.button
            onClick={handleGoogle}
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-white/15 bg-white/5 text-[#E6E6EB] text-sm font-medium hover:bg-white/10 hover:border-white/30 transition-all duration-300 mb-5"
          >
            <FcGoogle size={20} />
            Continue with Google
          </motion.button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[#9CA3AF] text-xs">or login with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
              <input
                name="email" type="email" placeholder="Email address"
                value={form.email} onChange={handleChange} required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
              <input
                name="password" type={showPass ? "text" : "password"} placeholder="Password"
                value={form.password} onChange={handleChange} required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white">
                {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>

            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Login"}
            </motion.button>
          </form>

          <p className="text-center text-[#9CA3AF] text-sm mt-6">
            Don't have an account?{" "}
            <Link to="/signup" className="text-[#7C5CFF] hover:text-[#00E0FF] font-medium transition-colors">
              Signup
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}