<script lang="ts">
	import Icon from "@iconify/svelte";
	import { isOn, connectedTrackers } from "#lib/store/index.js";
	import { t } from "#lib/lang/index.js";

	// turning off clears the tracker list (null means the app just started, so leave it alone)
	$effect(() => {
		if ($isOn === false) connectedTrackers.set([]);
	});
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-12">
	<div class="power-button-bg"></div>

	<p class="font-heading text-2xl">
		{$isOn ? $t("home.connected") : $t("home.disconnected")}
	</p>
	<button class="power-button hoverable" class:connected={$isOn === true} onclick={() => isOn.update((on) => !on)}>
		<Icon class="text-white" icon="ri:shut-down-line" width={78} />
	</button>
	<p class="font-heading text-xl text-text-alt">
		{$t("home.count", { value: $connectedTrackers.length })}
	</p>
</div>

<style>
	@reference "../../app.css";

	.power-button-bg {
		@apply absolute -z-10 h-50 w-50;
		background: linear-gradient(135deg, #9a48ee 0%, #f05d38 100%);
		filter: blur(100px);
	}

	.power-button {
		@apply relative flex h-50 w-50 items-center justify-center rounded-full shadow-lg hover:bg-secondary/24 active:bg-secondary/12;
		background: var(--slimetora-gradient-alt);
	}

	.power-button.connected {
		background: var(--slimetora-gradient);
		z-index: 0;
	}

	.power-button.connected::before {
		background: rgba(0, 0, 0, 0.2);
	}

	.power-button::before {
		@apply absolute inset-0 z-[-1] rounded-full p-1;
		content: "";
		background: linear-gradient(180deg, #f05d38 0%, #9a48ee 100%);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
	}
</style>
