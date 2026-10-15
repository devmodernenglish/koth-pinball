<script setup lang="ts">
import CabinetLayout from '@/components/templates/CabinetLayout.vue';
import PinballArena from '@/components/organisms/PinballArena.vue';
import CabinetSidebar from '@/components/organisms/CabinetSidebar.vue';
</script>

<template>
  <CabinetLayout>
    <template #main>
      <PinballArena />
    </template>
    <template #sidebar>
      <CabinetSidebar />
    </template>
  </CabinetLayout>
</template>
