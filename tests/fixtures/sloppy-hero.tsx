// Import dependencies
import React, { useState } from 'react';

export function SloppyHero(props: any) {
  // Set state
  const [status, setStatus] = useState('idle');

  // Handle click
  const handleLaunch = async () => {
    try {
      await fetch('/api/launch');
    } catch (err) {}
  };

  const tierLabel = props.isEnterprise ? 'Enterprise' : props.isPro ? 'Pro' : 'Free';

  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 p-12">
      <div className="mx-auto max-w-4xl rounded-3xl shadow-2xl bg-white/10 p-8">
        <h1 className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent text-5xl font-bold">
          Unleash the power of seamless workflow elevation
        </h1>
        <p className="mt-4 text-white/80">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </p>
        <p className="mt-2 text-sm text-white/70">
          Trusted by Sarah Jenkins, VP at Acme Corp — Tier: {tierLabel} ({status})
        </p>
        <button
          type="button"
          onClick={handleLaunch}
          className="mt-6 rounded-full bg-white px-6 py-3 font-semibold transition-all duration-300 hover:scale-110"
        >
          Get Started Today
        </button>
      </div>
    </section>
  );
}
