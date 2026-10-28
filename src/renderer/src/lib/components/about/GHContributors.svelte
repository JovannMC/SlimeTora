<script lang="ts">
	import { onMount } from "svelte";
	import { t } from "#lib/lang/index";
	import { error } from "#lib/log/index";
	import { GITHUB_API_URL } from "#lib/util/consts";
	import AboutSection from "./AboutSection.svelte";

	type Contributor = {
		name: string;
		github: string;
		avatar: string;
	};

	type GitHubContributor = {
		login: string;
		avatar_url: string;
		html_url: string;
	};

	const CACHE_KEY = "ghContribs";
	const EXCLUDED = new Set(["JovannMC", "RealmyTheMan", "OCSYT"]);

	let ghContribs: Contributor[] = $state([]);

	function readCache(): Contributor[] | null {
		const cached = sessionStorage.getItem(CACHE_KEY);
		if (!cached) return null;

		try {
			const parsed = JSON.parse(cached);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// invalid cache, fetch again below
		}
		sessionStorage.removeItem(CACHE_KEY);
		return null;
	}

	async function fetchContributors(): Promise<Contributor[]> {
		const response = await fetch(`${GITHUB_API_URL}/contributors?per_page=100`);
		if (!response.ok) throw new Error(`HTTP error, status: ${response.status}`);

		const all: GitHubContributor[] = await response.json();
		return all
			.filter((c) => !EXCLUDED.has(c.login))
			.map((c) => ({ name: c.login, avatar: c.avatar_url, github: c.html_url }));
	}

	onMount(async () => {
		if (typeof sessionStorage === "undefined") return;

		const cached = readCache();
		if (cached) {
			ghContribs = cached;
			return;
		}

		try {
			ghContribs = await fetchContributors();
			sessionStorage.setItem(CACHE_KEY, JSON.stringify(ghContribs));
		} catch (e) {
			error(["about", "github"], `Error fetching GitHub contributors: ${e}`);
		}
	});
</script>

<AboutSection icon="ri:github-line" title={$t("about.gh_contributors.title")}>
	{#if ghContribs.length === 0}
		<p class="text-sm text-gray-400">{$t("about.gh_contributors.none")}</p>
	{:else}
		{#each ghContribs as c}
			<div class="flex items-center gap-3">
				<a href={c.github} target="_blank" rel="noopener noreferrer">
					<img src={c.avatar} alt={c.name} class="h-8 w-8 rounded-full bg-black object-cover" />
				</a>
				<a
					href={c.github}
					target="_blank"
					rel="noopener noreferrer"
					class="font-heading text-base hover:underline"
				>
					{c.name}
				</a>
			</div>
		{/each}
	{/if}
</AboutSection>
