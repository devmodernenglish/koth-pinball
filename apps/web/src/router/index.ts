import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/cabinet' },
    { path: '/cabinet', name: 'cabinet', component: () => import('@/views/CabinetView.vue') },
    { path: '/play', name: 'play', component: () => import('@/views/PlayView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/play' },
  ],
});
