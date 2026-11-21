package scheduler

import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

@Service
class MemoFolders(private val records: Records) {
    fun rename(userId: Int, month: String, from: String, to: String) {
        val period = queryMonth(month)
        records.list<MemoItem>(userId, "r.month = :month and r.category = :name",
            "month" to month, "name" to from, includeDeleted = true).forEach { it.category = to }
        records.list<Task>(userId, "r.date between :start and :end and r.category = :name",
            "start" to period.atDay(1), "end" to period.atEndOfMonth(), "name" to from,
            includeDeleted = true).forEach { it.category = to }
        topics(userId, month, from).forEach { it.name = to }
    }

    fun hide(userId: Int, month: String, category: String) {
        val hidden = records.list<HiddenFolder>(userId, "r.month = :month and r.category = :name",
            "month" to month, "name" to category).firstOrNull()
        if (hidden == null) records.insert(HiddenFolder().apply {
            this.month = month
            this.category = category
        }, userId)
        topics(userId, month, category).forEach { it.isFolder = false }
    }

    private fun topics(userId: Int, month: String, name: String) =
        records.list<MindTopic>(userId, "r.month = :month and r.name = :name",
            "month" to month, "name" to name, includeDeleted = true)

    fun copy(userId: Int, month: String, category: String?, excludeDone: Boolean, ids: Set<Int>): Map<String, Any> {
        val next = queryMonth(month).plusMonths(1).toString()
        val source = when {
            ids.isNotEmpty() -> records.list<MemoItem>(userId, "r.month = :month and r.id in :ids",
                "month" to month, "ids" to ids, order = "r.parentId, r.position, r.id")
            !category.isNullOrEmpty() -> records.list<MemoItem>(userId, "r.month = :month and r.category = :category",
                "month" to month, "category" to category, order = "r.parentId, r.position, r.id")
            else -> records.list<MemoItem>(userId, "r.month = :month", "month" to month,
                order = "r.parentId, r.position, r.id")
        }.filter { ids.isNotEmpty() || !excludeDone || !it.completed }

        val parents = mutableMapOf<Int, Int>()
        var copied = 0
        fun copyItem(original: MemoItem, parent: Int?): Int {
            val params = arrayOf("month" to next, "category" to original.category, "text" to original.text)
            val match = "r.month = :month and r.category = :category and r.text = :text"
            val existing = if (parent == null)
                records.list<MemoItem>(userId, "$match and r.parentId is null", *params).firstOrNull()
            else records.list<MemoItem>(userId, "$match and r.parentId = :parent", *params,
                "parent" to parent).firstOrNull()
            if (existing != null) return existing.id
            copied++
            return records.insert(MemoItem().apply {
                this.month = next
                this.category = original.category
                text = original.text
                content = original.content
                completed = original.completed
                position = original.position
                parentId = parent
            }, userId).id
        }
        for (item in source.filter { it.parentId == null }) parents[item.id] = copyItem(item, null)
        for (item in source.filter { it.parentId != null }) {
            val parent = parents[item.parentId] ?: continue
            copyItem(item, parent)
        }
        return mapOf("ok" to true, "copied" to copied, "nextMonth" to next)
    }
}

@RestController
@RequestMapping("/api/memo-items")
@Transactional
class MemoItemsController(
    private val records: Records,
    private val completion: MemoCompletion,
    private val folders: MemoFolders,
) {
    @GetMapping
    fun list(@AuthenticationPrincipal account: Account, @RequestParam month: String): List<MemoItem> =
        records.list(account.id, "r.month = :month", "month" to month,
            order = "r.category, r.position, r.createdAt, r.id")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): MemoItem {
        val input = Input(body)
        val month = input.pattern("month", Input.MONTH)
        val category = input.string("category", max = 50)
        val text = input.string("text", max = 200)
        val parent = input.integer("parentId", optional = true)
        input.validate()
        records.lockUser(account.id)
        if (parent != null && records.own<MemoItem>(account.id, parent) == null)
            notFound("항목을 찾을 수 없습니다.")
        val position = records.list<MemoItem>(account.id, "r.month = :month and r.category = :category",
            "month" to month!!, "category" to category!!).size
        return records.insert(MemoItem().apply {
            this.month = month
            this.category = category
            this.text = text!!
            parentId = parent
            this.position = position
        }, account.id)
    }

    @PatchMapping("/{id}")
    fun update(@AuthenticationPrincipal account: Account, @PathVariable id: Int, @RequestBody body: JsonBody): MemoItem {
        val input = Input(body)
        val text = input.string("text", max = 200, optional = true)
        val content = input.string("content", max = 20000, optional = true)
        val assigned = input.boolean("assigned")
        val completed = input.boolean("completed")
        val position = input.integer("position", optional = true, min = 0)
        input.validate()
        records.lockUser(account.id)
        val item = records.own<MemoItem>(account.id, id) ?: notFound("항목을 찾을 수 없습니다.")
        item.apply {
            if (text != null) this.text = text
            if (input.has("content")) this.content = content
            if (assigned != null) this.assigned = assigned
            if (completed != null) this.completed = completed
            if (position != null) this.position = position
        }
        if (completed != null) item.parentId?.let { completion.recompute(account.id, it) }
        return item
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<MemoItem>(account.id, id))
        return ok()
    }

    @GetMapping("/hidden-folders")
    fun hidden(@AuthenticationPrincipal account: Account, @RequestParam month: String): List<String> =
        records.list<HiddenFolder>(account.id, "r.month = :month", "month" to month).map { it.category }

    @PostMapping("/rename-folder")
    @ResponseStatus(HttpStatus.CREATED)
    fun rename(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Map<String, Boolean> {
        val input = Input(body)
        val month = input.pattern("month", Input.MONTH)
        val from = input.string("from", max = 50)
        val to = input.string("to", max = 50)
        input.validate()
        records.lockUser(account.id)
        folders.rename(account.id, month!!, from!!, to!!)
        return ok()
    }

    @PostMapping("/delete-folder")
    @ResponseStatus(HttpStatus.CREATED)
    fun hide(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Map<String, Boolean> {
        val input = Input(body)
        val month = input.pattern("month", Input.MONTH)
        val category = input.string("category", max = 50)
        input.validate()
        records.lockUser(account.id)
        folders.hide(account.id, month!!, category!!)
        return ok()
    }

    @PostMapping("/copy-to-next-month")
    @ResponseStatus(HttpStatus.CREATED)
    fun copy(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Map<String, Any> {
        val input = Input(body)
        val month = input.pattern("month", Input.MONTH)
        val category = input.string("category", max = 50, optional = true)
        val excludeDone = input.boolean("excludeCompleted") ?: false
        val ids = input.ids("itemIds")
        input.validate()
        records.lockUser(account.id)
        return folders.copy(account.id, month!!, category, excludeDone, ids)
    }
}
