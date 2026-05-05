<script setup lang="ts">
import { computed, ref } from 'vue'
import ExpenseList from '../components/ExpenseList.vue'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'

const emit = defineEmits<{
  (e: 'edit', expenseId: string): void
  (e: 'deleted'): void
}>()

const { settings, categoryMap } = useSettings()
const { filteredExpenses, deleteExpense, selectedYearMonth } = useExpenses()

const searchText = ref('')
const payerFilter = ref<'all' | 'me' | 'partner'>('all')
const categoryFilter = ref('all')

const filteredList = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return filteredExpenses.value.filter((item) => {
    const matchesPayer = payerFilter.value === 'all' || item.payer === payerFilter.value
    const matchesCategory = categoryFilter.value === 'all' || item.category === categoryFilter.value
    const matchesKeyword =
      !keyword ||
      [
        item.title,
        item.note,
        categoryMap.value[item.category]?.name,
        settings.value.meName,
        settings.value.partnerName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)

    return matchesPayer && matchesCategory && matchesKeyword
  })
})

const handleDelete = (id: string) => {
  if (!window.confirm('确认删除这条记录吗？')) return
  deleteExpense(id)
  emit('deleted')
}
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">记录列表</p>
          <h2>按月份查看每一笔消费</h2>
        </div>
      </div>

      <div class="filter-toolbar">
        <label class="field-group">
          <span class="field-label">月份</span>
          <input v-model="selectedYearMonth" type="month" />
        </label>

        <label class="field-group">
          <span class="field-label">付款人</span>
          <select v-model="payerFilter">
            <option value="all">全部</option>
            <option value="me">{{ settings.meName }}</option>
            <option value="partner">{{ settings.partnerName }}</option>
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">类别</span>
          <select v-model="categoryFilter">
            <option value="all">全部</option>
            <option
              v-for="category in settings.categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </label>

        <label class="field-group search-field">
          <span class="field-label">搜索</span>
          <input v-model="searchText" type="search" placeholder="搜索说明、类别" />
        </label>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">共 {{ filteredList.length }} 笔</p>
          <h3>筛选结果</h3>
        </div>
      </div>

      <ExpenseList
        :expenses="filteredList"
        :effective-date="(expense) => getEffectiveExpenseDate(expense, selectedYearMonth)"
        @edit="emit('edit', $event.id)"
        @delete="handleDelete"
      />
    </section>
  </section>
</template>
