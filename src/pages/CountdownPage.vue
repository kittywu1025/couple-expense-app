<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useCountdown } from '../composables/useCountdown'

const { settings, setSettings } = useCountdown()

const form = reactive({
  startedDate: settings.value.startedDate || new Date().toISOString().slice(0, 10),
  birthday: settings.value.birthday || new Date().toISOString().slice(0, 10),
})

const daysTogether = computed(() => {
  if (!settings.value.startedDate) return null
  const start = new Date(settings.value.startedDate)
  const today = new Date()
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
  return diff >= 0 ? diff : 0
})

const birthdayCountdown = computed(() => {
  if (!settings.value.birthday) return null
  const [ , month, day] = settings.value.birthday.split('-').map(Number)
  const today = new Date()
  const birthdayThisYear = new Date(today.getFullYear(), month - 1, day)
  const nextBirthday = birthdayThisYear < today || birthdayThisYear.toDateString() === today.toDateString()
    ? new Date(today.getFullYear() + 1, month - 1, day)
    : birthdayThisYear
  const diff = Math.ceil((nextBirthday.getTime() - today.getTime()) / 86400000)
  return diff >= 0 ? diff : 0
})

const saveSettings = () => {
  setSettings({
    startedDate: form.startedDate,
    birthday: form.birthday,
  })
}
</script>

<template>
  <section class="page-card">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">纪念日</p>
        <h2>倒数日与纪念</h2>
      </div>
    </div>

    <div class="summary-row">
      <div class="mini-card">
        <span>在一起天数</span>
        <strong>{{ daysTogether !== null ? daysTogether : '未设置' }}</strong>
      </div>
      <div class="mini-card">
        <span>生日倒数</span>
        <strong>{{ birthdayCountdown !== null ? birthdayCountdown : '未设置' }}</strong>
      </div>
    </div>

    <div class="section-card">
      <div class="section-header">
        <h3>设置日期</h3>
      </div>
      <div class="expense-form">
        <label>
          在一起日期
          <input type="date" v-model="form.startedDate" />
        </label>
        <label>
          另一半生日
          <input type="date" v-model="form.birthday" />
        </label>
        <div class="form-actions">
          <button class="primary-button" type="button" @click="saveSettings">保存</button>
        </div>
      </div>
    </div>

    <div class="countdown-card">
      <h3>温馨提醒</h3>
      <p>你可以把这些日期当做关系里的小事件，设置后会一直保存在本地，方便随时查看。</p>
    </div>
  </section>
</template>
