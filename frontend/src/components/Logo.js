import React from "react";

// CAVI logo assets live in /public. Each <img> isolates its own SVG gradient ids.
export function LogoMark({ size = 36, className = "" }) {
  return (
    <img
      src="/cavi-icon.svg"
      alt="CAVI"
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
      draggable={false}
    />
  );
}

export function Logo({ size = 34, showWordmark = true, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {showWordmark && <span className="ff-head font-bold text-lg tracking-tight">CAVI</span>}
    </span>
  );
}
