import React from "react";

export function Input(props) {
  return (
    <input
      {...props}
      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}