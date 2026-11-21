package scheduler

import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

@RestController
@RequestMapping("/api/recurring")
@Transactional
class RecurringController(private val records: Records) {
    @GetMapping
    fun list(@AuthenticationPrincipal account: Account): List<RecurringItem> =
        records.list(account.id, order = "r.createdAt, r.id")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): RecurringItem {
        val input = Input(body)
        val title = input.string("title", max = 200)
        val category = input.string("category", max = 50, optional = true)
        input.validate()
        records.lockUser(account.id)
        return records.insert(RecurringItem().apply {
            this.title = title!!
            this.category = category
        }, account.id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<RecurringItem>(account.id, id))
        return ok()
    }
}

@RestController
@RequestMapping("/api/week-items")
@Transactional
class WeekItemsController(private val records: Records) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal account: Account, @RequestParam from: LocalDate, @RequestParam to: LocalDate,
    ): List<WeekItem> = records.list(account.id, "r.weekStart between :from and :to",
        "from" to from, "to" to to, order = "r.weekStart, r.createdAt, r.id")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): WeekItem {
        val input = Input(body)
        val start = input.date("weekStart")
        val title = input.string("title", max = 200)
        val category = input.string("category", max = 50, optional = true)
        val days = input.pattern("days", Input.DAYS, optional = true)
        input.validate()
        records.lockUser(account.id)
        return records.insert(WeekItem().apply {
            weekStart = start!!
            this.title = title!!
            this.category = category
            this.days = days
        }, account.id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<WeekItem>(account.id, id))
        return ok()
    }
}

@RestController
@RequestMapping("/api/period-items")
@Transactional
class PeriodItemsController(private val records: Records) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal account: Account, @RequestParam from: LocalDate, @RequestParam to: LocalDate,
    ): List<PeriodItem> = records.list(account.id, "r.startDate <= :to and r.endDate >= :from",
        "from" to from, "to" to to, order = "r.startDate, r.createdAt, r.id")

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): PeriodItem {
        val input = Input(body)
        val start = input.date("startDate")
        val end = input.date("endDate")
        val title = input.string("title", max = 200)
        val category = input.string("category", max = 50, optional = true)
        input.validate()
        if (end!! < start!!) badRequest("끝 날짜가 시작 날짜보다 빠를 수 없습니다.")
        records.lockUser(account.id)
        return records.insert(PeriodItem().apply {
            startDate = start
            endDate = end
            this.title = title!!
            this.category = category
        }, account.id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal account: Account, @PathVariable id: Int): Map<String, Boolean> {
        records.lockUser(account.id)
        records.delete(records.own<PeriodItem>(account.id, id))
        return ok()
    }
}
