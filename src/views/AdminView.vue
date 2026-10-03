<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '../store.js'
import AppIcon from '../components/AppIcon.vue'

const store = useStore()
const router = useRouter()

// 禁言时长：默认 24 小时，操作前由管理员选择
const muteHours = ref(24)
const mutePresets = [1, 6, 24, 72, 168]

onMounted(() => {
  if (!store.isAdmin) {
    router.push('/')
    return
  }
  Promise.all([store.loadAdminStats(), store.loadAdminList(true)])
})
</script>

<template>
  <section class="admin-page view-enter">
    <div class="admin-head">
      <button class="back-button" @click="router.push('/')">← 返回社区</button>
      <p class="eyebrow blue">ADMIN PANEL</p>
      <h1>管理后台</h1>
      <p>查看并管理社区里的所有帖子与社区，编辑或删除违规内容。</p>
      <div class="admin-stats">
        <div class="admin-stat">
          <b>{{ store.adminStats.posts }}</b
          ><span>帖子</span>
        </div>
        <div class="admin-stat">
          <b>{{ store.adminStats.communities }}</b
          ><span>社区</span>
        </div>
        <div class="admin-stat">
          <b>{{ store.adminStats.users }}</b
          ><span>用户</span>
        </div>
        <div class="admin-stat">
          <b>{{ store.adminStats.reports }}</b
          ><span>待处理举报</span>
        </div>
        <div class="admin-stat">
          <b>{{ store.adminStats.banned || 0 }}</b
          ><span>已封禁</span>
        </div>
        <div class="admin-stat">
          <b>{{ store.adminStats.muted || 0 }}</b
          ><span>禁言中</span>
        </div>
      </div>
    </div>
    <div class="admin-tabs">
      <button :class="{ active: store.adminSub === 'posts' }" @click="store.switchAdmin('posts')">
        帖子<template v-if="store.adminSub === 'posts'">（{{ store.adminTotal }}）</template>
      </button>
      <button :class="{ active: store.adminSub === 'communities' }" @click="store.switchAdmin('communities')">
        社区<template v-if="store.adminSub === 'communities'">（{{ store.adminTotal }}）</template>
      </button>
      <button :class="{ active: store.adminSub === 'users' }" @click="store.switchAdmin('users')">
        用户<template v-if="store.adminSub === 'users'">（{{ store.adminTotal }}）</template>
      </button>
      <button :class="{ active: store.adminSub === 'reports' }" @click="store.switchAdmin('reports')">
        举报<template v-if="store.adminSub === 'reports'">（{{ store.adminTotal }}）</template>
      </button>
    </div>
    <div class="admin-toolbar">
      <select
        v-if="store.adminSub === 'reports'"
        v-model="store.adminReportStatus"
        class="admin-status-select"
        @change="store.loadAdminList(true)"
      >
        <option value="pending">待处理</option>
        <option value="dismissed">已忽略</option>
        <option value="taken_down">已删除</option>
      </select>
      <input
        v-model="store.adminQ"
        :placeholder="
          store.adminSub === 'posts'
            ? '搜索标题、内容、作者或社区…'
            : store.adminSub === 'users'
              ? '搜索昵称或邮箱…'
              : store.adminSub === 'reports'
                ? '搜索帖子、举报人或作者…'
                : '搜索社区名称、简介或创建者…'
        "
        @keyup.enter="store.loadAdminList(true)"
      />
      <button class="outline-button" @click="store.loadAdminList(true)">搜索</button>
    </div>
    <div v-if="store.adminSub === 'posts'" class="admin-list">
      <div v-for="p in store.adminPosts" :key="p.id" class="admin-row">
        <div class="admin-row-info">
          <b>{{ p.title }}</b>
          <small
            >{{ p.author }} · {{ p.community }} · {{ store.relativeDate(p.created_at)
            }}<template v-if="p.media && p.media.length"> · {{ p.media.length }} 个媒体</template></small
          >
        </div>
        <div class="admin-row-actions">
          <button
            :class="{ 'flag-on': p.pinned }"
            :title="p.pinned ? '取消置顶' : '置顶该帖'"
            @click="store.togglePostFlag(p, 'pinned')"
          >
            {{ p.pinned ? '📌 已置顶' : '📌 置顶' }}
          </button>
          <button
            :class="{ 'flag-on': p.featured }"
            :title="p.featured ? '取消加精' : '设为精华'"
            @click="store.togglePostFlag(p, 'featured')"
          >
            <AppIcon name="spark" :size="13" />
            {{ p.featured ? '已加精' : '加精' }}
          </button>
          <button @click="store.openAdminEdit('post', p)">编辑</button>
          <button class="danger-text" @click="store.confirmAdminDelete('post', p)">删除</button>
        </div>
      </div>
      <p v-if="!store.adminPosts.length && !store.adminLoading" class="admin-empty">没有找到符合条件的帖子。</p>
    </div>
    <div v-else-if="store.adminSub === 'users'" class="admin-list">
      <div v-for="u in store.adminUsers" :key="u.id" class="admin-row admin-user-row">
        <div class="admin-row-info" @click="store.openUserDetail(u)">
          <b>
            {{ u.name }}
            <span v-if="u.role === 'admin'" class="admin-anon-badge">管理员</span>
            <span v-if="u.status === 'banned'" class="admin-anon-badge danger-badge">已封禁</span>
            <span v-else-if="u.muted" class="admin-anon-badge muted-badge">禁言中</span>
          </b>
          <small
            >{{ u.email }} · 加入 {{ store.joinDate(u.created_at) }} · {{ u.post_count }} 帖 / {{ u.comment_count }} 评
            / {{ u.like_count }} 赞</small
          >
        </div>
        <div class="admin-row-actions">
          <!-- 治理操作：封禁/解封、禁言/解禁、角色调整 -->
          <button v-if="u.status !== 'banned'" class="danger-text" @click.stop="store.setUserState(u, 'ban')">
            封禁
          </button>
          <button v-else @click.stop="store.setUserState(u, 'unban')">解封</button>
          <template v-if="u.muted">
            <button @click.stop="store.setUserState(u, 'unmute')">解除禁言</button>
          </template>
          <template v-else>
            <select v-model.number="muteHours" class="admin-mute-select" title="禁言时长" @click.stop>
              <option v-for="h in mutePresets" :key="h" :value="h">{{ h >= 24 ? `${h / 24} 天` : `${h} 小时` }}</option>
            </select>
            <button @click.stop="store.setUserState(u, 'mute', muteHours)">禁言</button>
          </template>
          <button v-if="u.role !== 'admin'" @click.stop="store.setUserState(u, 'promote')">设为管理员</button>
          <button v-else class="danger-text" @click.stop="store.setUserState(u, 'demote')">撤销管理员</button>
          <button @click.stop="store.openUserDetail(u)">查看详情 →</button>
        </div>
      </div>
      <p v-if="!store.adminUsers.length && !store.adminLoading" class="admin-empty">没有找到符合条件的用户。</p>
    </div>
    <div v-else-if="store.adminSub === 'communities'" class="admin-list">
      <div v-for="c in store.adminCommunities" :key="c.id" class="admin-row">
        <div class="admin-row-info">
          <b>{{ c.name }}</b>
          <small
            >{{ c.description || '暂无简介' }} · {{ c.postCount }} 篇帖子 · 创建者 {{ c.owner_name || '系统' }}</small
          >
        </div>
        <div class="admin-row-actions">
          <button @click="store.openAdminEdit('community', c)">编辑</button>
          <button class="danger-text" @click="store.confirmAdminDelete('community', c)">删除</button>
        </div>
      </div>
      <p v-if="!store.adminCommunities.length && !store.adminLoading" class="admin-empty">没有找到符合条件的社区。</p>
    </div>
    <div v-else class="admin-list">
      <div v-for="r in store.adminReports" :key="r.id" class="admin-row admin-report-row">
        <div class="admin-row-info">
          <b>{{ r.post_title }}</b>
          <small
            >举报人 {{ r.reporter_name }} · 作者 {{ r.post_author }} · {{ r.community }} ·
            {{ store.relativeDate(r.created_at) }}</small
          >
          <small class="admin-report-reason">理由：{{ r.reason }}</small>
        </div>
        <div class="admin-row-actions">
          <template v-if="r.status === 'pending'">
            <button @click="store.resolveReport(r, 'dismiss')">忽略</button>
            <button class="danger-text" @click="store.resolveReport(r, 'delete')">删除帖子</button>
          </template>
          <span v-else class="admin-resolved">{{ r.status === 'taken_down' ? '已删除并结案' : '已忽略' }}</span>
        </div>
      </div>
      <p v-if="!store.adminReports.length && !store.adminLoading" class="admin-empty">没有找到符合条件的举报。</p>
    </div>
    <button
      v-if="store.adminHasMore"
      class="load-more"
      :disabled="store.adminLoading"
      @click="store.loadAdminList(false)"
    >
      <AppIcon name="arrowUp" :size="14" class="flip-down" />
      {{ store.adminLoading ? '加载中…' : '加载更多' }}
    </button>

    <!-- 编辑帖子 / 社区 -->
    <div v-if="store.adminEdit" class="admin-modal" @click.self="store.adminEdit = null">
      <div class="admin-modal-box card">
        <h2>{{ store.adminEdit.type === 'post' ? '编辑帖子' : '编辑社区' }}</h2>
        <template v-if="store.adminEdit.type === 'post'">
          <label>标题<input v-model="store.adminEditDraft.title" maxlength="160" /></label>
          <label>内容<textarea v-model="store.adminEditDraft.content" rows="4"></textarea></label>
          <label
            >所属社区<select v-model="store.adminEditDraft.communityId">
              <option v-for="c in store.communities" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select></label
          >
        </template>
        <template v-else>
          <label>社区名称<input v-model="store.adminEditDraft.name" maxlength="80" /></label>
          <label
            >社区简介<textarea v-model="store.adminEditDraft.description" rows="4" maxlength="500"></textarea>
          </label>
        </template>
        <div class="admin-modal-actions">
          <button class="primary" @click="store.saveAdminEdit">保存修改</button>
          <button class="link" @click="store.adminEdit = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 确认删除 -->
    <div v-if="store.adminDeleteTarget" class="admin-modal" @click.self="store.adminDeleteTarget = null">
      <div class="admin-modal-box card">
        <h2>确认删除</h2>
        <p class="admin-warn-text">
          确定要删除「{{ store.adminDeleteTarget.title }}」吗？此操作不可恢复，帖子内的媒体文件也会一并清理。
        </p>
        <div class="admin-modal-actions">
          <button class="primary danger" @click="store.doAdminDelete">确认删除</button>
          <button class="link" @click="store.adminDeleteTarget = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 用户详情 -->
    <div v-if="store.selectedUser" class="admin-modal" @click.self="store.selectedUser = null">
      <div class="admin-modal-box card admin-user-modal">
        <div class="admin-user-detail-head">
          <div>
            <b
              >{{ store.selectedUser.name
              }}<span v-if="store.selectedUser.role === 'admin'" class="admin-anon-badge">管理员</span></b
            >
            <small
              >{{ store.selectedUser.email }} · 加入 {{ store.joinDate(store.selectedUser.created_at) }} ·
              {{ store.selectedUser.post_count }} 帖 / {{ store.selectedUser.comment_count }} 评 /
              {{ store.selectedUser.like_count }} 赞</small
            >
          </div>
          <button class="link" @click="store.selectedUser = null"><AppIcon name="close" :size="13" /> 关闭</button>
        </div>
        <div class="admin-user-tabs">
          <button :class="{ active: store.userDetailTab === 'posts' }" @click="store.userDetailTab = 'posts'">
            帖子（{{ store.userPosts.length }}）
          </button>
          <button :class="{ active: store.userDetailTab === 'comments' }" @click="store.userDetailTab = 'comments'">
            评论（{{ store.userComments.length }}）
          </button>
        </div>
        <div class="admin-user-scroll">
          <div v-if="store.userDetailLoading" class="search-status">加载中…</div>
          <template v-else>
            <div v-if="store.userDetailTab === 'posts'">
              <div v-for="p in store.userPosts" :key="p.id" class="admin-user-item">
                <div class="admin-row-info">
                  <b>{{ p.title }}<span v-if="p.is_treehole" class="admin-anon-badge">讨论区 · 匿名</span></b>
                  <small
                    >{{ p.community }} · {{ store.relativeDate(p.created_at)
                    }}<template v-if="p.media && p.media.length"> · {{ p.media.length }} 个媒体</template></small
                  >
                </div>
                <div class="admin-row-actions">
                  <button @click="store.openAdminEdit('post', p)">编辑</button>
                  <button class="danger-text" @click="store.confirmAdminDelete('post', p)">删除</button>
                </div>
              </div>
              <p v-if="!store.userPosts.length" class="admin-empty">该用户没有发布帖子。</p>
            </div>
            <div v-else>
              <div v-for="c in store.userComments" :key="c.id" class="admin-user-item">
                <div class="admin-row-info">
                  <b>{{ c.content }}</b>
                  <small
                    >评论于《{{ c.post_title }}》 · {{ c.community }} · {{ store.relativeDate(c.created_at) }}</small
                  >
                </div>
                <div class="admin-row-actions">
                  <button class="danger-text" @click="store.deleteUserComment(c)">删除</button>
                </div>
              </div>
              <p v-if="!store.userComments.length" class="admin-empty">该用户没有发表评论。</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
