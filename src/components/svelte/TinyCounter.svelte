<script lang="ts">
  let count = 0;
</script>

<button
  type="button"
  class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
  on:click={() => count += 1}
>
  Count: {count}
</button>
