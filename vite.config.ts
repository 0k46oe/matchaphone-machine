import {defineConfig} from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({plugins:[react()],test:{environment:"jsdom",setupFiles:"./src/test-setup.ts"},build:{target:"es2020",sourcemap:false,rollupOptions:{output:{manualChunks(id){if(!id.includes("node_modules"))return;if(/[\\/]react(-dom)?[\\/]|react-router/.test(id))return "vendor-react";if(/dexie|zustand|zod/.test(id))return "vendor-data";if(/lucide-react/.test(id))return "vendor-icons";return "vendor"}}}}});
