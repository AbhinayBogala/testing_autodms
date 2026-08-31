"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 4000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="devilx-page">
      {/* Background */}
      <div className="devilx-bg-glow" />

      {/* Particles */}
      <div className="devilx-particles">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      {/* Main branding */}
      <div className="devilx-center">
        <div className="devilx-logo">
          <span className="devil-text">Devil</span>
          <span className="x-text">X</span>
        </div>

        <div className="devilx-line" />

        <div className="devilx-subtitle">
          INSTAGRAM AUTOMATION
        </div>
      </div>

      {/* Developer credit */}
      <div className="devilx-developer">
        Developed by <strong>Abhinay Bogala</strong>
      </div>

      {/* Massive X */}
      <div className="massive-x">
        X
      </div>

      {/* White flash before login */}
      <div className="devilx-flash" />

      <style jsx>{`
        .devilx-page {
          position: fixed;
          inset: 0;
          z-index: 999999;

          overflow: hidden;

          display: flex;
          align-items: center;
          justify-content: center;

          background:
            radial-gradient(
              circle at center,
              rgba(90, 0, 20, 0.28) 0%,
              rgba(10, 0, 4, 0.97) 45%,
              #000 100%
            );

          color: white;

          animation:
            pageFadeOut
            0.55s
            cubic-bezier(0.4, 0, 1, 1)
            3.45s
            forwards;
        }

        /* =====================================
           BACKGROUND GLOW
        ===================================== */

        .devilx-bg-glow {
          position: absolute;

          width: 360px;
          height: 360px;

          border-radius: 50%;

          background: rgba(255, 0, 55, 0.14);

          filter: blur(110px);

          animation:
            bgGlow
            2s
            ease-in-out
            infinite;
        }

        /* =====================================
           CENTER
        ===================================== */

        .devilx-center {
          position: relative;
          z-index: 5;

          display: flex;
          flex-direction: column;
          align-items: center;

          animation:
            centerIntro
            1s
            cubic-bezier(0.16, 1, 0.3, 1)
            forwards;
        }

        /* =====================================
           LOGO
        ===================================== */

        .devilx-logo {
          font-family: Arial, Helvetica, sans-serif;

          font-size: clamp(65px, 10vw, 125px);

          font-weight: 900;

          line-height: 1;

          letter-spacing: -7px;

          opacity: 0;

          transform: scale(0.65);

          animation:
            logoIn
            1s
            cubic-bezier(0.16, 1, 0.3, 1)
            0.1s
            forwards;
        }

        .devil-text {
          color: #ffffff;
        }

        .x-text {
          display: inline-block;

          color: #ff1744;

          text-shadow:
            0 0 10px #ff1744,
            0 0 25px #ff1744,
            0 0 50px rgba(255, 23, 68, 0.8),
            0 0 90px rgba(255, 23, 68, 0.5);

          animation:
            xPulse
            0.6s
            ease-in-out
            infinite
            alternate;
        }

        /* =====================================
           LINE
        ===================================== */

        .devilx-line {
          width: 0;

          height: 2px;

          margin-top: 28px;

          background: #ff1744;

          box-shadow:
            0 0 8px #ff1744,
            0 0 20px #ff1744,
            0 0 45px rgba(255, 23, 68, 0.5);

          animation:
            lineIn
            0.7s
            cubic-bezier(0.16, 1, 0.3, 1)
            0.65s
            forwards;
        }

        /* =====================================
           SUBTITLE
        ===================================== */

        .devilx-subtitle {
          margin-top: 15px;

          font-family: Arial, Helvetica, sans-serif;

          font-size: 11px;

          letter-spacing: 5px;

          color: rgba(255, 255, 255, 0.45);

          opacity: 0;

          transform: translateY(8px);

          animation:
            subtitleIn
            0.7s
            ease
            0.9s
            forwards;
        }

        /* =====================================
           DEVELOPER
        ===================================== */

        .devilx-developer {
          position: absolute;

          bottom: 42px;

          z-index: 5;

          font-family: Arial, Helvetica, sans-serif;

          font-size: 12px;

          letter-spacing: 1.5px;

          color: rgba(255, 255, 255, 0.4);

          opacity: 0;

          transform: translateY(10px);

          animation:
            developerIn
            0.8s
            ease
            1.1s
            forwards;
        }

        .devilx-developer strong {
          color: rgba(255, 255, 255, 0.85);

          font-weight: 500;
        }

        /* =====================================
           MASSIVE X
        ===================================== */

        .massive-x {
          position: absolute;

          z-index: 10;

          left: 50%;
          top: 50%;

          transform:
            translate(-50%, -50%)
            scale(0);

          transform-origin: center;

          font-family: Arial, Helvetica, sans-serif;

          font-size: 45vw;

          line-height: 0.8;

          font-weight: 900;

          color: #ff1744;

          opacity: 0;

          pointer-events: none;

          text-shadow:
            0 0 20px #ff1744,
            0 0 50px #ff1744,
            0 0 100px #ff1744,
            0 0 180px rgba(255, 23, 68, 0.8),
            0 0 300px rgba(255, 23, 68, 0.5);

          animation:
            massiveX
            1s
            cubic-bezier(0.16, 1, 0.3, 1)
            2.65s
            forwards;
        }

        /* =====================================
           FLASH
        ===================================== */

        .devilx-flash {
          position: absolute;

          inset: 0;

          z-index: 20;

          background: white;

          opacity: 0;

          pointer-events: none;

          animation:
            flash
            0.35s
            ease-out
            3.65s
            forwards;
        }

        /* =====================================
           PARTICLES
        ===================================== */

        .devilx-particles {
          position: absolute;

          inset: 0;

          pointer-events: none;
        }

        .devilx-particles span {
          position: absolute;

          width: 2px;
          height: 2px;

          border-radius: 50%;

          background: rgba(255, 255, 255, 0.5);

          animation:
            particle
            2s
            ease-in-out
            infinite;
        }

        .devilx-particles span:nth-child(1) {
          left: 10%;
          top: 20%;
        }

        .devilx-particles span:nth-child(2) {
          left: 20%;
          top: 70%;
          animation-delay: 0.2s;
        }

        .devilx-particles span:nth-child(3) {
          left: 80%;
          top: 25%;
          animation-delay: 0.4s;
        }

        .devilx-particles span:nth-child(4) {
          left: 90%;
          top: 70%;
          animation-delay: 0.6s;
        }

        .devilx-particles span:nth-child(5) {
          left: 35%;
          top: 15%;
          animation-delay: 0.8s;
        }

        .devilx-particles span:nth-child(6) {
          left: 65%;
          top: 85%;
          animation-delay: 1s;
        }

        .devilx-particles span:nth-child(7) {
          left: 8%;
          top: 50%;
          animation-delay: 1.2s;
        }

        .devilx-particles span:nth-child(8) {
          left: 92%;
          top: 45%;
          animation-delay: 1.4s;
        }

        .devilx-particles span:nth-child(9) {
          left: 50%;
          top: 10%;
          animation-delay: 0.5s;
        }

        .devilx-particles span:nth-child(10) {
          left: 55%;
          top: 90%;
          animation-delay: 1.6s;
        }

        .devilx-particles span:nth-child(11) {
          left: 28%;
          top: 40%;
          animation-delay: 1.8s;
        }

        .devilx-particles span:nth-child(12) {
          left: 72%;
          top: 55%;
          animation-delay: 2s;
        }

        /* =====================================
           ANIMATIONS
        ===================================== */

        @keyframes centerIntro {
          from {
            opacity: 1;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes logoIn {
          0% {
            opacity: 0;

            transform: scale(0.65);

            filter: blur(18px);
          }

          55% {
            opacity: 1;

            transform: scale(1.08);

            filter: blur(0);
          }

          100% {
            opacity: 1;

            transform: scale(1);
          }
        }

        @keyframes xPulse {
          from {
            transform: translateY(-2px);

            text-shadow:
              0 0 10px #ff1744,
              0 0 25px #ff1744,
              0 0 50px rgba(255, 23, 68, 0.5);
          }

          to {
            transform: translateY(2px);

            text-shadow:
              0 0 15px #ff1744,
              0 0 35px #ff1744,
              0 0 75px #ff1744,
              0 0 120px rgba(255, 23, 68, 0.6);
          }
        }

        @keyframes lineIn {
          from {
            width: 0;

            opacity: 0;
          }

          to {
            width: 190px;

            opacity: 1;
          }
        }

        @keyframes subtitleIn {
          from {
            opacity: 0;

            transform: translateY(8px);
          }

          to {
            opacity: 1;

            transform: translateY(0);
          }
        }

        @keyframes developerIn {
          from {
            opacity: 0;

            transform: translateY(10px);
          }

          to {
            opacity: 1;

            transform: translateY(0);
          }
        }

        @keyframes bgGlow {
          0%,
          100% {
            transform: scale(0.8);

            opacity: 0.45;
          }

          50% {
            transform: scale(1.3);

            opacity: 1;
          }
        }

        @keyframes particle {
          0%,
          100% {
            opacity: 0.1;

            transform:
              translateY(0)
              scale(1);
          }

          50% {
            opacity: 0.8;

            transform:
              translateY(-15px)
              scale(1.5);
          }
        }

        /*
         * THE MAIN X EXPLOSION
         */

        @keyframes massiveX {
          0% {
            opacity: 0;

            transform:
              translate(-50%, -50%)
              scale(0);

            filter: blur(20px);
          }

          15% {
            opacity: 0.2;

            transform:
              translate(-50%, -50%)
              scale(0.15);

            filter: blur(5px);
          }

          40% {
            opacity: 0.8;

            transform:
              translate(-50%, -50%)
              scale(0.6);

            filter: blur(0);
          }

          70% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(1.4);

            filter: blur(0);
          }

          100% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(3.5);

            filter: blur(2px);
          }
        }

        @keyframes flash {
          0% {
            opacity: 0;
          }

          50% {
            opacity: 0.08;
          }

          100% {
            opacity: 0;
          }
        }

        @keyframes pageFadeOut {
          0% {
            opacity: 1;

            transform: scale(1);
          }

          70% {
            opacity: 1;

            transform: scale(1);
          }

          100% {
            opacity: 0;

            transform: scale(1.05);
          }
        }

        /* =====================================
           MOBILE
        ===================================== */

        @media (max-width: 600px) {
          .devilx-logo {
            font-size: 65px;

            letter-spacing: -4px;
          }

          .devilx-subtitle {
            font-size: 9px;

            letter-spacing: 3px;
          }

          .devilx-developer {
            bottom: 28px;

            font-size: 10px;
          }

          .massive-x {
            font-size: 70vw;
          }
        }

        /* =====================================
           REDUCED MOTION
        ===================================== */

        @media (prefers-reduced-motion: reduce) {
          .devilx-page,
          .devilx-logo,
          .devilx-line,
          .devilx-subtitle,
          .devilx-developer,
          .devilx-bg-glow,
          .x-text,
          .massive-x,
          .devilx-flash,
          .devilx-particles span {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </main>
  );
}