<script lang="ts">
  let isDark = false;

  const applyTheme = (dark: boolean) => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    isDark = dark;
  };

  const initTheme = () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(stored ? stored === 'dark' : prefersDark);
  };

  const toggleTheme = () => applyTheme(!isDark);
</script>

<svelte:window on:load={initTheme} />

<button
  type="button"
  on:click={toggleTheme}
  class="rounded-md border border-slate-300 p-2 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
  aria-label="Toggle color theme"
>
  {#if isDark}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      class="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
    </svg>
  {:else}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      class="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M21 13.2A9 9 0 1 1 10.8 3 7 7 0 0 0 21 13.2Z" />
    </svg>
  {/if}
</button>
