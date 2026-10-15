<script setup lang="ts"></script>

<template>
  <div class="cabinet-layout">
    <main class="cabinet-layout__main">
      <slot name="main" />
    </main>
    <aside class="cabinet-layout__sidebar">
      <slot name="sidebar" />
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.cabinet-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: spacing(md);
  min-height: 100%;
  padding: spacing(md);

  @include respond-to(lg) {
    grid-template-columns: minmax(0, 1fr) size(sidebar);
    align-items: start;
  }

  &__main,
  &__sidebar {
    min-width: 0;
  }
}
</style>
