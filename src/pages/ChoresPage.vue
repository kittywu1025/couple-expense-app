<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useChores } from '../composables/useChores'
import { useUsers } from '../composables/useUsers'
import type { Chore } from '../types'

const {
  chores,
  addChore,
  toggleChoreDone,
  deleteChore,
  totalPoints,
  mePoints,
  partnerPoints,
} = useChores()

const { userConfig } = useUsers()

const newChore = reactive<Partial<Chore>>({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  performer: 'me',
  points: 10,
  done: false,
  note: '',
})

const completedCount = computed(() => chores.value.filter((item) => item.done).length)
const totalCount = computed(() => chores.value.length)

const createChore = () => {
  if (!newChore.title?.trim()) return
  addChore({
    id: crypto.randomUUID(),
    title: newChore.title.trim(),
    date: newChore.date || new Date().toISOString().slice(0, 10),
    performer: newChore.performer as Chore['performer'],
    points: newChore.points || 0,
    done: false,
    note: newChore.note?.trim(),
  })
  newChore.title = ''
  newChore.points = 10
  newChore.note = ''
}
</script>

<template>
  <section class="page-card">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">家务</p>
        <h2>家务积分系统</h2>
      </div>
    </div>

    <div class="summary-row">
      <div class="mini-card">
        <span>总积分</span>
        <strong>{{ totalPoints }}</strong>
      </div>
      <div class="mini-card">
        <span>我得到</span>
        <strong>{{ mePoints }}</strong>
      </div>
      <div class="mini-card">
        <span>{{ userConfig.partnerName }}</span>
        <strong>{{ partnerPoints }}</strong>
      </div>
    </div>
    <div class="section-card">
      <div class="section-header">
        <h3>添加家务</h3>
      </div>
      <div class="expense-form">
        <label>
          任务名称
          <input v-model="newChore.title" placeholder="例如：清理厨房" />
        </label>
        <label>
          完成日期
          <input type="date" v-model="newChore.date" />
        </label>
        <label>
          执行者
          <select v-model="newChore.performer">
            <option value="me">我</option>
            <option value="partner">另一半</option>
          </select>
        </label>
        <label>
          积分
          <input type="number" min="1" v-model.number="newChore.points" />
        </label>
        <label>
          备注
          <input v-model="newChore.note" placeholder="可选" />
        </label>
        <div class="form-actions">
          <button class="primary-button" type="button" @click="createChore">保存任务</button>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-header">
        <h3>任务记录</h3>
        <span>{{ completedCount }} / {{ totalCount }} 已完成</span>
      </div>
      <div v-if="!chores.length" class="empty-state">还没有记录，开始记录家务积分吧。</div>
      <div v-else class="todo-list">
        <div v-for="item in chores" :key="item.id" class="todo-item" :class="{ done: item.done }">
          <div>
            <div class="todo-title">{{ item.title }}</div>
            <div class="todo-meta">{{ item.date }} · {{ item.performer === 'me' ? userConfig.meName : userConfig.partnerName }} · {{ item.points }} 分</div>
            <div class="todo-note">{{ item.note || '无备注' }}</div>
          </div>
          <div class="todo-actions">
            <button class="text-button" type="button" @click="toggleChoreDone(item.id)">
              {{ item.done ? '取消' : '完成' }}
            </button>
            <button class="text-button danger" type="button" @click="deleteChore(item.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
