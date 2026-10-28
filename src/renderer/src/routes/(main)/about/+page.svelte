<script lang="ts">
	import { onMount } from "svelte";
	import { getBridge } from "#lib/api/bridge.js";
	import { error } from "#lib/log/index.js";
	import { t } from "#lib/lang/index.js";
	import ContributorsPanel from "#lib/components/about/Contributors.svelte";
	import TranslatorsPanel from "#lib/components/about/Translators.svelte";
	import OtherCreditsPanel from "#lib/components/about/OtherCredits.svelte";
	import GHContributors from "#lib/components/about/GHContributors.svelte";

	let appVersion = $state("0.0.0");
	let showingEasterEgg = $state(false);

	onMount(async () => {
		try {
			appVersion = (await getBridge().getAppInfo()).version;
		} catch (err) {
			error("Failed to fetch app version:", err);
		}
	});

	const MAYA_LINKS = [
		{ icon: "ri:link", url: "https://jovann.me" },
		{ icon: "ri:github-fill", url: "https://github.com/JovannMC" },
	];
	const REALMY_LINKS = [
		{ icon: "ri:link", url: "https://realmy.net" },
		{ icon: "ri:github-fill", url: "https://github.com/RealmyTheMan" },
	];
	const BRACKETPROTO_LINKS = [
		{ icon: "ri:link", url: "https://bracketproto.com" },
		{ icon: "ri:github-fill", url: "https://github.com/OCSYT" },
	];

	const contributors = [
		{
			pfp: "/pfp/jovannmc.png",
			name: "JovannMC (Maya)",
			byline: "about.contributors.byline.jovannmc",
			links: MAYA_LINKS,
		},
		{ pfp: "/pfp/realmy.jpg", name: "Realmy", byline: "about.contributors.byline.realmy", links: REALMY_LINKS },
		{
			pfp: "/pfp/bracketproto.png",
			name: "BracketProto",
			byline: "about.contributors.byline.bracketproto",
			links: BRACKETPROTO_LINKS,
		},
	];

	const contributorsEasterEgg = [
		{
			pfp: "/pfp/easter-egg/joe-van.png",
			name: "Joe-van",
			byline: "about.contributors.easter_egg.joe-van",
			links: MAYA_LINKS,
		},
		{
			pfp: "/pfp/realmy.jpg",
			name: "Grrealmy",
			byline: "about.contributors.easter_egg.grrealmy",
			links: REALMY_LINKS,
		},
		{
			pfp: "/pfp/bracketproto.png",
			name: "BracketProto",
			byline: "about.contributors.easter_egg.bracketproto",
			links: BRACKETPROTO_LINKS,
		},
	];

	const others = [
		{
			name: "haritorax-interpreter",
			link: "https://github.com/JovannMC/haritorax-interpreter",
			author: "JovannMC",
		},
		{
			name: "haritorax-slimevr-bridge",
			link: "https://github.com/sim1222/haritorax-slimevr-bridge",
			author: "sim1222",
		},
		{ name: "slimevr-node", link: "https://github.com/SlimeVR/slimevr-node", author: "SlimeVR" },
		{ name: "MoSlime", link: "https://MoSlime/MoSlime", author: "MoSlime" },
		{ name: "Onboarding media", link: "https://github.com/SlimeVR/SlimeVR-Server", author: "SlimeVR" },
	];
</script>

<!-- holding shift shows the easter egg stuff -->
<svelte:window
	onkeydown={(e) => {
		if (e.key === "Shift") showingEasterEgg = true;
	}}
	onkeyup={(e) => {
		if (e.key === "Shift") showingEasterEgg = false;
	}}
/>

<div class="flex flex-col items-center">
	<div class="flex flex-col items-center p-4">
		<div class="flex w-full flex-col items-center gap-4 rounded-xl bg-panel p-4 shadow">
			<div class="flex items-center gap-3">
				<img src="/logo.png" alt="SlimeTora Logo" class="h-14 w-14 rounded-lg drop-shadow-lg" />
				<span class="font-heading text-3xl font-bold text-text">
					SlimeTora <span class="text-xs text-text-alt">v{appVersion}</span>
				</span>
			</div>
			<p class="max-w-lg text-center text-base text-text-alt">{$t("about.description")}</p>
		</div>
	</div>

	<div class="flex flex-row gap-8 p-4">
	<!-- same size, half half -->
		<div class="flex flex-col gap-8 w-1/2">
			<ContributorsPanel contributors={showingEasterEgg ? contributorsEasterEgg : contributors} />
			<GHContributors />
		</div>
		<div class="flex flex-1 flex-col gap-8 w-1/2">
			<TranslatorsPanel />
			<OtherCreditsPanel {others} />
		</div>
	</div>
</div>
