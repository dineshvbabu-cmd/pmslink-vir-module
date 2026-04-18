process.env.HOSTNAME = "0.0.0.0";
process.env.HOST = "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";

console.log(`Starting standalone server on ${process.env.HOSTNAME}:${process.env.PORT}`);

await import("../.next/standalone/server.js");