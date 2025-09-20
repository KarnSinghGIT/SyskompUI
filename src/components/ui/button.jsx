import React from "react";

export function Button({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}