package scheduler

import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.text.Collator
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Service
class MemoCompletion(private val records: Records) {
    fun recompute(userId: Int, parentId: Int) {
        val parent = records.own<MemoItem>(userId, parentId) ?: return
        val children = records.list<MemoItem>(userId, "r.parentId = :parent", "parent" to parentId)
        parent.completed = children.isNotEmpty() && children.all { it.completed }
    }

    fun syncTask(userId: Int, task: Task) {
        val target = task.subItemId?.let { records.own<MemoItem>(userId, it) }
            ?: if (task.subItemId != null) null else records.list<MemoItem>(
                userId, "r.month = :month and r.category = :category and r.text = :title",
                "month" to task.date.toString().take(7), "category" to (task.category ?: "미분류"),
                "title" to task.title,
            ).firstOrNull()
        if (target == null || target.completed == task.completed) return
        target.completed = task.completed
        target.parentId?.let { recompute(userId, it) }
    }

    fun syncCategory(userId: Int, task: Task, category: String) {
        val month = task.date.toString().take(7)
        val items = records.list<MemoItem>(userId, "r.month = :month and r.category = :category",
            "month" to month, "category" to category)
        // Compare through MySQL so this matches the legacy column collation.
        val existing = records.list<MemoItem>(userId,
            "r.month = :month and r.category = :category and r.text = :title",
            "month" to month, "category" to category, "title" to task.title).firstOrNull()
        if (existing != null) {
            if (existing.content.isNullOrEmpty() && !task.memo.isNullOrEmpty()) existing.content = task.memo
            return
        }
        records.insert(MemoItem().apply {
            this.month = month
            this.category = category
            text = task.title
            content = task.memo
            position = items.size
        }, userId)
    }
}

@Service
class TaskOccurrences(private val records: Records) {
    fun materialize(userId: Int, from: LocalDate, to: LocalDate) {
        if (to < from) return
        // Serialize materialization with other writes for this user. Deleted rows count as prior occurrences.
        records.lockUser(userId)
        val existing = records.list<Task>(userId, "r.date between :from and :to",
            "from" to from, "to" to to, includeDeleted = true)
        val recurringDays = existing.mapNotNull { task -> task.recurringId?.let { it to task.date } }.toSet()
        val weeklyDays = existing.mapNotNull { task -> task.weekItemId?.let { it to task.date } }.toSet()
        val periodDays = existing.mapNotNull { task -> task.periodItemId?.let { it to task.date } }.toSet()

        records.list<RecurringItem>(userId).forEach { item ->
            dates(maxOf(from, item.createdAt.toLocalDate()), to).forEach { date ->
                if (item.id to date !in recurringDays)
                    add(userId, date, item.title, item.category) { recurringId = item.id }
            }
        }
        records.list<WeekItem>(userId, "r.weekStart between :start and :end",
            "start" to from.minusDays(6), "end" to to).forEach { item ->
            val first = maxOf(from, item.weekStart, item.createdAt.toLocalDate())
            val last = minOf(to, item.weekStart.plusDays(6))
            val allowed = item.days?.takeIf { it.isNotEmpty() }?.split(",")?.mapNotNull { it.toLongOrNull() }?.toSet()
            dates(first, last).forEach { date ->
                val offset = ChronoUnit.DAYS.between(item.weekStart, date)
                if ((allowed == null || offset in allowed) && item.id to date !in weeklyDays)
                    add(userId, date, item.title, item.category) { weekItemId = item.id }
            }
        }
        records.list<PeriodItem>(userId, "r.startDate <= :to and r.endDate >= :from",
            "from" to from, "to" to to).forEach { item ->
            val first = maxOf(from, item.startDate, item.createdAt.toLocalDate())
            dates(first, minOf(to, item.endDate)).forEach { date ->
                if (item.id to date !in periodDays)
                    add(userId, date, item.title, item.category) { periodItemId = item.id }
            }
        }
    }

    private fun dates(from: LocalDate, to: LocalDate): Sequence<LocalDate> =
        generateSequence(from) { it.plusDays(1) }.takeWhile { it <= to }

    private fun add(userId: Int, day: LocalDate, title: String, category: String?, origin: Task.() -> Unit) {
        records.insert(Task().apply {
            date = day
            this.title = title
            this.category = category
            origin()
        }, userId)
    }
}

@RestController
@RequestMapping("/api/tasks")
@Transactional
class TasksController(
    private val records: Records,
    private val occurrences: TaskOccurrences,
    private val memo: MemoCompletion,
) {
    @GetMapping
    fun daily(@AuthenticationPrincipal account: Account, @RequestParam date: LocalDate): List<Task> {
        occurrences.materialize(account.id, date, date)
        return records.list(account.id, "r.date = :date", "date" to date,
            order = "r.position, r.createdAt, r.id")
    }

    @GetMapping("/range")
    fun range(
        @AuthenticationPrincipal account: Account, @RequestParam from: LocalDate, @RequestParam to: LocalDate,
    ): List<Task> {
        occurrences.materialize(account.id, from, to)
        return records.list(account.id, "r.date between :from and :to", "from" to from, "to" to to,
            order = "r.date, r.createdAt, r.id")
    }

    @GetMapping("/categories")
    fun categories(@AuthenticationPrincipal account: Account, @RequestParam(required = false) month: String?): List<String> {
        val order = "r.updatedAt desc, r.id desc"
        val tasks = if (month.isNullOrEmpty()) records.list<Task>(account.id, "r.category is not null", order = order)
        else {
            val period = queryMonth(month)
            records.list<Task>(account.id, "r.category is not null and r.date between :from and :to",
                "from" to period.atDay(1), "to" to period.atEndOfMonth(), order = order)
        }
        return tasks.mapNotNull { it.category }.distinctBy { it.lowercase() }
            .sortedWith(Collator.getInstance(java.util.Locale.ENGLISH))
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Task {
        val input = Input(body)
        val title = input.string("title", max = 200)
        val category = input.string("category", max = 50, optional = true)
        val date = input.date("date", message = "날짜는 YYYY-MM-DD 형식이어야 합니다.")
        val start = input.pattern("startTime", Input.TIME, optional = true)
        val end = input.pattern("endTime", Input.TIME, optional = true)
        val parentId = input.integer("parentTaskId", optional = true)
        input.validate()
        records.lockUser(account.id)
        if (parentId != null && records.own<Task>(account.id, parentId) == null)
            notFound("할일을 찾을 수 없습니다.")
        val task = records.insert(Task().apply {
            this.title = title!!
            this.category = category
            this.date = date!!
            startTime = start
            endTime = end
            parentTaskId = parentId
            isChore = category.equals("schedule", ignoreCase = true)
            position = records.list<Task>(account.id, "r.date = :day", "day" to date).size
        }, account.id)
        if (!category.isNullOrEmpty() && parentId == null) memo.syncCategory(account.id, task, category)
        return task
    }

    @PatchMapping("/{id}")
    fun update(@AuthenticationPrincipal account: Account, @PathVariable id: Int, @RequestBody body: JsonBody): Task {
        val input = Input(body)
        val title = input.string("title", max = 200, optional = true)
        val category = input.string("category", max = 50, optional = true)
        val date = input.date("date", optional = true)
        val completed = input.boolean("completed")
        val chore = input.boolean("isChore")
        val priority = input.boolean("highPriority")
        val top = input.integer("top3Order", optional = true, min = 1, max = 10)
        val start = input.pattern("startTime", Input.TIME, optional = true)
        val end = input.pattern("endTime", Input.TIME, optional = true)
        val position = input.integer("position", optional = true, min = 0)
        val note = input.string("memo", max = 10000, optional = true)
        val subId = input.integer("subItemId", optional = true)
        input.validate()
        records.lockUser(account.id)
        val task = own(account.id, id)
        if (subId != null && records.own<MemoItem>(account.id, subId) == null)
            notFound("항목을 찾을 수 없습니다.")
        task.apply {
            if (title != null) this.title = title
            if (input.has("category")) this.category = category
            if (date != null) this.date = date
            if (completed != null) this.completed = completed
            if (chore != null) isChore = chore
            else if (!input.has("isChore") && category.equals("schedule", ignoreCase = true)) isChore = true
            if (priority != null) highPriority = priority
            if (input.has("top3Order")) top3Order = top?.toByte()
            if (input.has("startTime")) startTime = start
            if (input.has("endTime")) endTime = end
            if (position != null) this.position = position
            if (input.has("memo")) this.memo = note
            if (input.has("subItemId")) subItemId = subId
        }
        if (completed != null) memo.syncTask(account.id, task)
        if (!category.isNullOrEmpty()) memo.syncCategory(account.id, task, category)
        return records.updated(task)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(own(account.id, id))
        return ok()
    }

    private fun own(userId: Int, id: Int) =
        records.own<Task>(userId, id) ?: notFound("할일을 찾을 수 없습니다.")
}
