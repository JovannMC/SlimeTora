<script>
	import Header from "#lib/components/layout/Header.svelte";

	let { children } = $props();
</script>

<div class="flex h-full min-h-screen flex-col">
	<Header />
	<div class="flex grow flex-row">
		<div class="flex-1">
			{@render children()}
		</div>
	</div>
</div>
