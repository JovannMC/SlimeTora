import mdi from "@iconify-json/mdi/icons.json";
import ri from "@iconify-json/ri/icons.json";
import { addCollection } from "@iconify/svelte";

// bundled so icons don't have to be fetched from the Iconify API (blocked by the CSP)
addCollection(mdi);
addCollection(ri);
