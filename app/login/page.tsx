"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      {/* BACKGROUND */}

      <div className="login-grid" />

      <div className="login-glow login-glow-1" />
      <div className="login-glow login-glow-2" />

      <div className="login-particles">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>

      {/* LOGIN CONTAINER */}

      <div className="login-wrapper">
        {/* BRAND */}

        <div className="login-brand">
          <div className="brand-logo">
            <span>Devil</span>
            <strong>X</strong>
          </div>

          <div className="brand-line" />

          <p>INSTAGRAM AUTOMATION</p>
        </div>

        {/* CARD */}

        <div className="login-card">
          <div className="card-shine" />

          <div className="login-heading">
            <h1>Welcome back.</h1>

            <p>
              Sign in to continue to your
              <span> DevilX </span>
              workspace.
            </p>
          </div>

          <form onSubmit={handleLogin}>
            {/* EMAIL */}

            <div className="field">
              <label>Email address</label>

              <div className="input-wrapper">
                <span className="input-icon">✉</span>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div className="field">
              <label>Password</label>

              <div className="input-wrapper">
                <span className="input-icon">⌁</span>

                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* ERROR */}

            {error && (
              <div className="login-error">
                <span>!</span>
                {error}
              </div>
            )}

            {/* BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="login-button"
            >
              <span className="button-content">
                {loading ? (
                  <>
                    <span className="spinner" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <span className="arrow">→</span>
                  </>
                )}
              </span>

              <span className="button-glow" />
            </button>
          </form>

          <div className="security-note">
            <span className="security-dot" />
            Secure authentication powered by DevilX
          </div>
        </div>

        {/* FOOTER */}

        <div className="login-footer">
          Developed by <strong>Abhinay Bogala</strong>
        </div>
      </div>

      <style jsx>{`
        .login-page {
          position: relative;

          min-height: 100vh;

          display: flex;

          align-items: center;

          justify-content: center;

          overflow: hidden;

          padding: 40px 20px;

          background:
            radial-gradient(
              circle at 50% 30%,
              rgba(80, 0, 20, 0.2),
              transparent 35%
            ),
            #030303;

          color: white;
        }

        /* ===============================
           GRID
        =============================== */

        .login-grid {
          position: absolute;

          inset: 0;

          opacity: 0.12;

          background-image:
            linear-gradient(
              rgba(255, 255, 255, 0.04) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.04) 1px,
              transparent 1px
            );

          background-size: 70px 70px;

          mask-image:
            radial-gradient(
              ellipse at center,
              black,
              transparent 80%
            );
        }

        /* ===============================
           GLOW
        =============================== */

        .login-glow {
          position: absolute;

          border-radius: 50%;

          filter: blur(100px);

          pointer-events: none;

          animation:
            loginGlow
            5s
            ease-in-out
            infinite;
        }

        .login-glow-1 {
          width: 400px;
          height: 400px;

          background: rgba(255, 0, 55, 0.1);

          top: -180px;
          right: -100px;
        }

        .login-glow-2 {
          width: 300px;
          height: 300px;

          background: rgba(255, 0, 40, 0.08);

          bottom: -150px;
          left: -100px;

          animation-delay: 1.5s;
        }

        /* ===============================
           PARTICLES
        =============================== */

        .login-particles {
          position: absolute;

          inset: 0;

          pointer-events: none;
        }

        .login-particles span {
          position: absolute;

          width: 2px;
          height: 2px;

          border-radius: 50%;

          background: #ff1744;

          box-shadow: 0 0 8px #ff1744;

          animation:
            loginParticle
            4s
            ease-in-out
            infinite;
        }

        ${Array.from({ length: 18 })
          .map(
            (_, i) => `
          .login-particles span:nth-child(${i + 1}) {
            left: ${5 + ((i * 43) % 90)}%;
            top: ${5 + ((i * 31) % 88)}%;
            animation-delay: ${(i % 6) * 0.5}s;
            opacity: ${0.15 + (i % 3) * 0.1};
          }
        `
          )
          .join("")}

        /* ===============================
           WRAPPER
        =============================== */

        .login-wrapper {
          position: relative;

          z-index: 10;

          width: 100%;

          max-width: 440px;

          animation:
            loginAppear
            0.8s
            cubic-bezier(0.16, 1, 0.3, 1)
            forwards;
        }

        /* ===============================
           BRAND
        =============================== */

        .login-brand {
          text-align: center;

          margin-bottom: 28px;
        }

        .brand-logo {
          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 46px;

          font-weight: 950;

          letter-spacing: -4px;

          line-height: 1;
        }

        .brand-logo span {
          color: white;
        }

        .brand-logo strong {
          color: #ff1744;

          text-shadow:
            0 0 10px #ff1744,
            0 0 25px #ff1744,
            0 0 50px rgba(255, 23, 68, 0.6);
        }

        .brand-line {
          width: 55px;

          height: 2px;

          margin: 14px auto;

          background: #ff1744;

          box-shadow: 0 0 15px #ff1744;
        }

        .login-brand p {
          margin: 0;

          font-size: 9px;

          letter-spacing: 4px;

          color: rgba(255, 255, 255, 0.35);
        }

        /* ===============================
           CARD
        =============================== */

        .login-card {
          position: relative;

          overflow: hidden;

          padding: 34px;

          border-radius: 24px;

          border: 1px solid rgba(255, 255, 255, 0.09);

          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.075),
              rgba(255, 255, 255, 0.025)
            );

          box-shadow:
            0 30px 100px rgba(0, 0, 0, 0.7),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);

          backdrop-filter: blur(25px);

          animation:
            cardAppear
            0.8s
            cubic-bezier(0.16, 1, 0.3, 1)
            0.1s
            backwards;
        }

        .card-shine {
          position: absolute;

          top: -100px;
          left: 50%;

          width: 250px;
          height: 150px;

          transform: translateX(-50%);

          background: rgba(255, 23, 68, 0.08);

          filter: blur(60px);

          pointer-events: none;
        }

        /* ===============================
           HEADING
        =============================== */

        .login-heading {
          margin-bottom: 28px;
        }

        .login-heading h1 {
          margin: 0;

          font-size: 27px;

          font-weight: 700;

          letter-spacing: -0.5px;
        }

        .login-heading p {
          margin: 9px 0 0;

          color: rgba(255, 255, 255, 0.42);

          font-size: 13px;

          line-height: 1.6;
        }

        .login-heading p span {
          color: rgba(255, 255, 255, 0.75);
        }

        /* ===============================
           FIELDS
        =============================== */

        .field {
          margin-bottom: 18px;
        }

        .field label {
          display: block;

          margin-bottom: 8px;

          font-size: 11px;

          font-weight: 500;

          color: rgba(255, 255, 255, 0.55);
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;

          left: 15px;
          top: 50%;

          transform: translateY(-50%);

          color: rgba(255, 255, 255, 0.3);

          font-size: 15px;

          pointer-events: none;
        }

        .input-wrapper input {
          width: 100%;

          height: 50px;

          padding: 0 15px 0 43px;

          border-radius: 12px;

          border: 1px solid rgba(255, 255, 255, 0.09);

          background: rgba(0, 0, 0, 0.45);

          color: white;

          outline: none;

          font-size: 13px;

          transition:
            border-color 0.25s ease,
            box-shadow 0.25s ease,
            background 0.25s ease;
        }

        .input-wrapper input::placeholder {
          color: rgba(255, 255, 255, 0.2);
        }

        .input-wrapper input:focus {
          border-color: rgba(255, 23, 68, 0.65);

          background: rgba(255, 23, 68, 0.025);

          box-shadow:
            0 0 0 3px rgba(255, 23, 68, 0.08),
            0 0 25px rgba(255, 23, 68, 0.08);
        }

        /* ===============================
           ERROR
        =============================== */

        .login-error {
          display: flex;

          align-items: center;

          gap: 9px;

          margin-bottom: 18px;

          padding: 11px 13px;

          border-radius: 10px;

          border: 1px solid rgba(255, 50, 70, 0.15);

          background: rgba(255, 40, 60, 0.08);

          color: #ff6b7d;

          font-size: 11px;
        }

        .login-error span {
          display: flex;

          align-items: center;

          justify-content: center;

          width: 18px;
          height: 18px;

          border-radius: 50%;

          background: rgba(255, 50, 70, 0.15);
        }

        /* ===============================
           BUTTON
        =============================== */

        .login-button {
          position: relative;

          width: 100%;

          height: 52px;

          overflow: hidden;

          border: none;

          border-radius: 12px;

          cursor: pointer;

          background: #ff1744;

          color: white;

          font-size: 13px;

          font-weight: 700;

          box-shadow:
            0 8px 25px rgba(255, 23, 68, 0.25);

          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .login-button:hover {
          transform: translateY(-2px);

          box-shadow:
            0 12px 35px rgba(255, 23, 68, 0.4);
        }

        .login-button:active {
          transform: translateY(0);
        }

        .login-button:disabled {
          cursor: not-allowed;

          opacity: 0.6;
        }

        .button-content {
          position: relative;

          z-index: 2;

          display: flex;

          align-items: center;

          justify-content: center;

          gap: 10px;
        }

        .arrow {
          font-size: 18px;

          transition: transform 0.2s ease;
        }

        .login-button:hover .arrow {
          transform: translateX(4px);
        }

        .button-glow {
          position: absolute;

          top: 0;
          left: -100%;

          width: 70%;
          height: 100%;

          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(255, 255, 255, 0.25),
              transparent
            );

          transform: skewX(-20deg);

          animation:
            buttonShine
            3s
            ease-in-out
            infinite;
        }

        /* ===============================
           SECURITY
        =============================== */

        .security-note {
          display: flex;

          align-items: center;

          justify-content: center;

          gap: 7px;

          margin-top: 22px;

          color: rgba(255, 255, 255, 0.22);

          font-size: 10px;
        }

        .security-dot {
          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: #31d158;

          box-shadow: 0 0 8px #31d158;
        }

        /* ===============================
           FOOTER
        =============================== */

        .login-footer {
          margin-top: 25px;

          text-align: center;

          color: rgba(255, 255, 255, 0.25);

          font-size: 10px;

          letter-spacing: 1px;
        }

        .login-footer strong {
          color: rgba(255, 255, 255, 0.55);

          font-weight: 500;
        }

        /* ===============================
           ANIMATIONS
        =============================== */

        @keyframes loginAppear {
          from {
            opacity: 0;

            transform:
              translateY(25px)
              scale(0.97);
          }

          to {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes cardAppear {
          from {
            opacity: 0;

            transform:
              translateY(20px)
              scale(0.98);
          }

          to {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }
        }

        @keyframes loginGlow {
          0%,
          100% {
            transform: scale(0.9);

            opacity: 0.5;
          }

          50% {
            transform: scale(1.2);

            opacity: 1;
          }
        }

        @keyframes loginParticle {
          0%,
          100% {
            transform:
              translateY(0)
              scale(1);

            opacity: 0.15;
          }

          50% {
            transform:
              translateY(-20px)
              scale(1.5);

            opacity: 0.8;
          }
        }

        @keyframes buttonShine {
          0% {
            left: -100%;
          }

          35%,
          100% {
            left: 140%;
          }
        }

        @media (max-width: 500px) {
          .login-page {
            padding: 25px 16px;
          }

          .login-card {
            padding: 25px 20px;
          }

          .brand-logo {
            font-size: 40px;
          }

          .login-heading h1 {
            font-size: 24px;
          }
        }
      `}</style>
    </main>
  );
}