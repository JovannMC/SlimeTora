<script>
	import Header from "#lib/components/layout/Header.svelte";
	import Navbar from "#lib/components/layout/Navbar.svelte";

	let { children } = $props();
</script>

<div class="flex h-full min-h-screen flex-col">
	<Header />
	<div class="flex grow flex-row">
		<div>
			<Navbar />
		</div>
		<div class="mt-16 ml-16 flex-1">
			{@render children()}
		</div>
	</div>
</div>
