<script setup lang="ts">
import PushPage from '../components/PushPage.vue'
import { rulesPageOpen } from '../composables/useUi'

/*
 * 结算算法说明：之后公式有更新，只改这一个页面。
 * 对应代码：src/utils/settlement.ts（单笔）和 src/utils/stats.ts（汇总）。
 */
</script>

<template>
  <PushPage title="结算算法说明" back-label="关于" @back="rulesPageOpen = false">
    <section class="card">
      <h2>1. 共同支出</h2>
      <p>记账时选「共同」的支出就是共同支出，需要两个人一起承担。选「个人」的支出只算付款人自己的，不参与结算。</p>
      <p class="formula">共同支出 = 所有「共同」记录的金额之和</p>
    </section>

    <section class="card">
      <h2>2. AA 比例</h2>
      <p>每笔共同记录有一个 0–10 的比例，表示两人各自承担几成。记账页滑条左边是我、右边是对方，比如 6:4 表示我承担 60%。</p>
      <p>谁付的钱不重要，重要的是各自承担几成。没付钱那位的那份，就算付款人先垫着：</p>
      <p class="formula">对方承担的部分 = 金额 × 对方份额 ÷ 10</p>
      <div class="example">
        <b>例子</b>
        小猫付了晚饭 ¥4,000，AA 比例 6:4（小猫 6、小狗 4）<br />
        → 小狗承担 ¥4,000 × 4 ÷ 10 = <b>¥1,600</b>，这部分是小猫先垫的
      </div>
    </section>

    <section class="card">
      <h2>3. 请客</h2>
      <p><b>付钱的人全出</b>时算「请客」，<b>不用对齐</b>，只记一次请客次数——比起算差额，我们更想记住谁请了谁。</p>
      <p>付钱的人一分不出、对方全出（比如在国外 TA 说请客，但我的卡汇率好、我先刷）不算请客：对方要把<b>全额</b>转给付钱的人，照常进结清。</p>
      <p class="formula">AA 部分 = 共同支出 − 请客的金额</p>
    </section>

    <section class="card">
      <h2>4. 结算差额</h2>
      <p>把统计周期（默认按结算日划分的一个月）里每笔 AA 谁先垫了多少加起来，再相互抵消：</p>
      <p class="formula">差额 = 对方帮我垫的合计 − 我帮对方垫的合计</p>
      <ul>
        <li>差额 ≤ ¥1,000：显示「基本扯平」，不用特意处理</li>
        <li>差额 &gt; ¥1,000：显示谁先垫得多一些；想对齐的话，另一位给对方这个差额就刚好</li>
        <li>App 不会催，也不会说谁欠谁</li>
      </ul>
      <div class="example">
        <b>例子</b>
        本月小猫帮小狗垫了 ¥37,745，小狗帮小猫垫了 ¥6,162<br />
        → 小猫先垫得多一些；想对齐的话，小狗给小猫 <b>¥31,583</b> 就刚好
      </div>
    </section>

    <section class="card">
      <h2>5. 有疑问、结清</h2>
      <p>共同记录记了就入账，对方首页会提醒「TA 新记了」。AA 可以按比例，也可以按金额（比如 2200 里我吃了 800）。</p>
      <p>对方觉得不对点「有疑问」，那笔就退回成<b>未入账</b>：先全算付款人自己的，不算 AA、不算请客、不进差额，改好或者对方同意后再按比例分。</p>
      <p>AA 的那份给了之后，先垫钱的人在「我的 → 结清」里勾「已收到」（像报销一样，可以一次勾好几笔）：两人各自承担多少照常算，但这些<b>不再进月末差额</b>。</p>
    </section>

    <section class="card">
      <h2>6. 首页的三张卡片</h2>
      <p class="formula">我们这个月花了 = 两个人全部支出之和</p>
      <p class="formula">我这个月花了 = 我的个人支出 + 共同支出里我承担的那份</p>
      <p class="formula">我这个月收入 = 只算自己的收入</p>
      <p class="note">对方的个人消费只计入总额，明细不会出现在你的列表、日历里；收入只有自己能看到。</p>
    </section>
  </PushPage>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
}
h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-soft);
}
p:last-child {
  margin-bottom: 0;
}
b {
  color: var(--text);
}
.formula {
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
  font-size: 13px;
}
.example {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-soft);
}
.example > b:first-child {
  display: block;
  font-size: 12px;
  color: var(--text-faint);
}
ul {
  margin: 0 0 8px;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-soft);
}
.note {
  font-size: 12px;
  color: var(--text-faint);
}
</style>
