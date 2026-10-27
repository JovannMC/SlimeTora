import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				pages: "../../dist/renderer",
				assets: "../../dist/renderer",
				fallback: "index.html",
				precompress: false,
				strict: true,
			}),
			csp: {
				mode: "hash",
				directives: {
					"default-src": ["self"],
					"script-src": ["self"],
					"style-src": ["self", "unsafe-inline"],
					"img-src": ["self", "data:", "blob:"],
					"font-src": ["self", "data:"],
					"connect-src": ["self"],
					"object-src": ["none"],
					"base-uri": ["none"],
					"frame-ancestors": ["none"],
				},
			},
		}),
	],
	server: {
		fs: { allow: [path.resolve(here, "..")] },
	},
	resolve: {
		alias: {
			// needs to be kept in sync with tsconfig paths entry
			$shared: path.resolve(here, "../shared"),
		},
	},
});
