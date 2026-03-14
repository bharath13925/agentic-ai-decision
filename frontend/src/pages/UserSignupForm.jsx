import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { FiCpu, FiMail, FiLock, FiUser, FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function UserSignupForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  /* ── Save user to MongoDB backend ── */
  const saveToBackend = async (uid, name, email, provider = "email") => {
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

  /* ── Email / Password Signup ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create in Firebase
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      // 2. Set display name in Firebase
      await updateProfile(cred.user, { displayName: form.name });
      // 3. Save to MongoDB
      await saveToBackend(cred.user.uid, form.name, form.email, "email");
      // 4. Redirect to login
      navigate("/login", { state: { message: "Account created! Please login." } });
    } catch (err) {
      const code = err.code;
      if (code === "auth/email-already-in-use") setError("This email is already registered.");
      else if (code === "auth/invalid-email") setError("Invalid email address.");
      else setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  /* ── Google Signup ── */
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
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
          <h2 className="text-2xl font-black text-white mb-1">Create Account</h2>
          <p className="text-[#9CA3AF] text-sm mb-6">Join AgenticIQ and start making smarter decisions.</p>

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
            <span className="text-[#9CA3AF] text-xs">or sign up with email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name */}
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
              <input
                name="name" type="text" placeholder="Full name"
                value={form.name} onChange={handleChange} required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
            </div>

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
                name="password" type={showPass ? "text" : "password"} placeholder="Password (min 6 chars)"
                value={form.password} onChange={handleChange} required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white">
                {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>

            {/* Confirm */}
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
              <input
                name="confirm" type={showConfirm ? "text" : "password"} placeholder="Re-enter password"
                value={form.confirm} onChange={handleChange} required
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white">
                {showConfirm ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>

            {form.confirm && (
              <p className={`text-xs -mt-2 ${form.password === form.confirm ? "text-green-400" : "text-red-400"}`}>
                {form.password === form.confirm ? "✓ Passwords match" : "✗ Passwords do not match"}
              </p>
            )}

            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account..." : "Create Account"}
            </motion.button>
          </form>

          <p className="text-center text-[#9CA3AF] text-sm mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-[#7C5CFF] hover:text-[#00E0FF] font-medium transition-colors">
              Login
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}