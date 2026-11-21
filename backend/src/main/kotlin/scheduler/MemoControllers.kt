package scheduler

import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

@RestController
@RequestMapping("/api/month-memos")
@Transactional
class MonthMemosController(private val records: Records) {
    @GetMapping
    fun list(@AuthenticationPrincipal account: Account, @RequestParam month: String): List<MonthMemo> =
        records.list(account.id, "r.month = :month", "month" to month,
            order = "r.category, r.date desc, r.createdAt desc, r.id desc")

    @PutMapping
    fun save(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Any {
        val input = Input(body)
        val id = input.integer("id", optional = true)
        val date = input.pattern("date", Input.DATE)
        val category = input.string("category", max = 50)
        val content = input.string("content", max = 20000)
        input.validate()
        records.lockUser(account.id)
        if (id != null && id != 0) {
            val memo = records.own<MonthMemo>(account.id, id) ?: return mapOf("ok" to false)
            if (content!!.isBlank()) {
                records.delete(memo)
                return mapOf("ok" to true, "deleted" to true)
            }
            memo.content = content
            memo.date = date!!
            memo.category = category!!
            return records.updated(memo)
        }
        if (content!!.isBlank()) return mapOf("ok" to true, "deleted" to false)
        return records.insert(MonthMemo().apply {
            this.date = date!!
            month = date.take(7)
            this.category = category!!
            this.content = content
        }, account.id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        val memo = records.own<MonthMemo>(account.id, id) ?: return mapOf("ok" to false)
        records.delete(memo)
        return ok()
    }
}

@RestController
@RequestMapping("/api/mind-topics")
@Transactional
class MindTopicsController(private val records: Records) {
    @GetMapping
    fun list(@AuthenticationPrincipal account: Account, @RequestParam month: String): List<MindTopic> =
        records.list(account.id, "r.month = :month", "month" to month, order = "r.createdAt, r.id")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): MindTopic {
        val input = Input(body)
        val month = input.pattern("month", Input.TOPIC_KEY)
        val name = input.string("name", max = 100)
        input.validate()
        records.lockUser(account.id)
        return records.insert(MindTopic().apply {
            this.month = month!!
            this.name = name!!
        }, account.id)
    }

    @PatchMapping("/{id}")
    fun update(@AuthenticationPrincipal account: Account, @PathVariable id: Int, @RequestBody body: JsonBody): MindTopic {
        val input = Input(body)
        val name = input.string("name", max = 100, optional = true)
        val folder = input.boolean("isFolder")
        val content = input.string("content", max = 20000, optional = true)
        input.validate()
        records.lockUser(account.id)
        return (records.own<MindTopic>(account.id, id) ?: notFound("주제를 찾을 수 없습니다.")).apply {
            if (name != null) this.name = name
            if (folder != null) isFolder = folder
            if (input.has("content")) this.content = content
        }
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<MindTopic>(account.id, id))
        return ok()
    }
}

@RestController
@RequestMapping("/api/memo-item-logs")
@Transactional
class MemoItemLogsController(private val records: Records) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal account: Account, @RequestParam memoItemId: Int,
        @RequestParam from: LocalDate, @RequestParam to: LocalDate,
    ): List<MemoItemLog> = records.list(account.id, "r.memoItemId = :item and r.date between :from and :to",
        "item" to memoItemId, "from" to from, "to" to to, order = "r.date desc, r.createdAt desc, r.id desc")

    @GetMapping("/labels")
    fun labels(@AuthenticationPrincipal account: Account, @RequestParam memoItemId: Int): List<String> =
        records.entityManager.createQuery(
            """select distinct r.label from MemoItemLog r
                where r.userId = :owner and r.memoItemId = :item and r.deletedAt is null order by r.label""",
            String::class.java,
        ).setParameter("owner", account.id).setParameter("item", memoItemId).resultList

    @GetMapping("/units")
    fun units(@AuthenticationPrincipal account: Account, @RequestParam memoItemId: Int): List<String> =
        records.entityManager.createQuery(
            """select r.unit from MemoItemLog r where r.userId = :owner and r.memoItemId = :item
                and r.deletedAt is null group by r.unit order by max(r.createdAt) desc, r.unit""",
            String::class.java,
        ).setParameter("owner", account.id).setParameter("item", memoItemId).resultList

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): MemoItemLog {
        val input = Input(body)
        val memoItemId = input.integer("memoItemId")
        val date = input.date("date")
        val label = input.string("label", max = 100)
        val count = input.integer("count", min = 1)
        val unit = input.string("unit", max = 20)
        input.validate()
        records.lockUser(account.id)
        if (records.own<MemoItem>(account.id, memoItemId!!) == null) notFound("항목을 찾을 수 없습니다.")
        return records.insert(MemoItemLog().apply {
            this.memoItemId = memoItemId
            this.date = date!!
            this.label = label!!
            this.count = count!!
            this.unit = unit!!
        }, account.id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<MemoItemLog>(account.id, id))
        return ok()
    }
}
