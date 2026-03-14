import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ScrollToTop from './pages/ScrollToTop';
import Navbar from './pages/Navbar';
import Footer from './pages/Footer';
import LandingPage from './pages/LandingPage';
import UserSignupForm from './pages/UserSignupForm';
import UserLoginForm from './pages/UserLoginForm';
import UserDashboard from './pages/UserDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import Support from './pages/Support';

function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="App">
        <Navbar />
        <Routes>
          <Route path="/"          element={<LandingPage />} />
          <Route path="/signup"    element={<UserSignupForm />} />
          <Route path="/login"     element={<UserLoginForm />} />
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/privacy"   element={<PrivacyPolicy />} />
          <Route path="/terms"     element={<TermsConditions />} />
          <Route path="/support"   element={<Support />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  );
}

export default App;