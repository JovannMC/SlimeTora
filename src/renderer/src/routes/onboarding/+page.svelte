<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "#lib/components/settings/Button.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import { t, locales, locale, changeLocale } from "#lib/lang/index";
</script>

<div class="flex min-h-screen flex-col justify-between text-center">
	<!-- TODO: add to main window also -->
	<div class="absolute top-4 left-4">
		<Select
			options={$locales.map((loc) => ({ value: loc, label: loc }))}
			selected={$locale}
			onChange={changeLocale}
			icon="ri:translate"
		/>
	</div>

	<div class="flex flex-1 flex-col items-center justify-center gap-6">
		<div class="flex items-center justify-center">
			<div class="logo-bg"></div>
			<img src="/logo.png" alt="SlimeTora Logo" class="h-32 w-32 rounded-[20px] drop-shadow-lg" />
		</div>
		<div class="flex flex-col gap-3">
			<h1 class="text-[40px]">{$t("onboarding.title")}</h1>
			<p class="w-150 text-text-alt">{$t("onboarding.welcome")}</p>
		</div>
	</div>

	<div class="flex w-full flex-col items-center gap-6 bg-panel p-8">
		<p class="w-150 text-text-alt">{$t("onboarding.setup")}</p>
		<div class="flex flex-row gap-4">
			<Button
				type="onboarding"
				label={$t("onboarding.start")}
				background="secondary"
				onClick={() => goto("/onboarding/setup")}
			/>
			<Button type="onboarding" label={$t("onboarding.skip")} background="button" onClick={() => goto("/")} />
		</div>
	</div>
</div>

<style>
	@reference "../../app.css";

	.logo-bg {
		@apply absolute -z-10 h-96 w-96;
		background: linear-gradient(135deg, #9a48ee 0%, #f05d38 100%);
		filter: blur(175px);
	}
</style>
