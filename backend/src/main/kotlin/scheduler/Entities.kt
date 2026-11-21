package scheduler

import com.fasterxml.jackson.annotation.JsonFormat
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

internal fun utcNow(): LocalDateTime = LocalDateTime.now(ZoneOffset.UTC).let {
    it.withNano(it.nano / 1_000_000 * 1_000_000)
}

@MappedSuperclass
abstract class Record {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    var id: Int = 0

    @Column(name = "createdAt", nullable = false, columnDefinition = "datetime(6)")
    @get:JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    var createdAt: LocalDateTime = utcNow()

    @Column(name = "deletedAt", columnDefinition = "datetime(6)")
    @get:JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    var deletedAt: LocalDateTime? = null
}

@MappedSuperclass
abstract class OwnedRecord : Record() {
    @Column(name = "userId", nullable = false)
    var userId: Int = 0

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", insertable = false, updatable = false)
    @get:JsonIgnore
    lateinit var user: User
}

@Entity
@Table(name = "hidden_folders")
class HiddenFolder : OwnedRecord() {
    @Column(name = "month", nullable = false, length = 7)
    var month: String = ""

    @Column(name = "category", nullable = false, length = 50)
    var category: String = ""
}

@Entity
@Table(name = "memo_item_logs")
class MemoItemLog : OwnedRecord() {
    @Column(name = "memoItemId", nullable = false)
    var memoItemId: Int = 0

    @Column(name = "date", nullable = false)
    var date: LocalDate = LocalDate.ofEpochDay(0)

    @Column(name = "label", nullable = false, length = 100)
    var label: String = ""

    @Column(name = "count", nullable = false)
    var count: Int = 1

    @Column(name = "unit", nullable = false, length = 20)
    var unit: String = "개"
}

@Entity
@Table(name = "memo_items")
class MemoItem : OwnedRecord() {
    @Column(name = "month", nullable = false, length = 7)
    var month: String = ""

    @Column(name = "category", nullable = false, length = 50)
    var category: String = ""

    @Column(name = "text", nullable = false, length = 200)
    var text: String = ""

    @Column(name = "parentId")
    var parentId: Int? = null

    @Column(name = "content", columnDefinition = "text")
    var content: String? = null

    @Column(name = "assigned", nullable = false, columnDefinition = "tinyint")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var assigned: Boolean = false

    @Column(name = "completed", nullable = false, columnDefinition = "tinyint")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var completed: Boolean = false

    @Column(name = "position", nullable = false)
    var position: Int = 0
}

@Entity
@Table(name = "mind_topics")
class MindTopic : OwnedRecord() {
    @Column(name = "month", nullable = false, length = 10)
    var month: String = ""

    @Column(name = "name", nullable = false, length = 100)
    var name: String = ""

    @Column(name = "isFolder", nullable = false, columnDefinition = "tinyint")
    @get:JsonProperty("isFolder")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var isFolder: Boolean = false

    @Column(name = "content", columnDefinition = "text")
    var content: String? = null
}

@Entity
@Table(name = "month_memos")
class MonthMemo : OwnedRecord() {
    @Column(name = "month", nullable = false, length = 7)
    var month: String = ""

    @Column(name = "date", nullable = false, length = 10)
    var date: String = ""

    @Column(name = "category", nullable = false, length = 50)
    var category: String = ""

    @Column(name = "content", nullable = false, columnDefinition = "text")
    var content: String = ""

    @Column(name = "updatedAt", nullable = false, columnDefinition = "datetime(6)")
    @get:JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    var updatedAt: LocalDateTime = createdAt

    @PreUpdate
    fun markUpdated() {
        updatedAt = utcNow()
    }
}

@Entity
@Table(name = "period_items")
class PeriodItem : OwnedRecord() {
    @Column(name = "startDate", nullable = false)
    var startDate: LocalDate = LocalDate.ofEpochDay(0)

    @Column(name = "endDate", nullable = false)
    var endDate: LocalDate = LocalDate.ofEpochDay(0)

    @Column(name = "title", nullable = false)
    var title: String = ""

    @Column(name = "category", length = 50)
    var category: String? = null
}

@Entity
@Table(name = "recurring_items")
class RecurringItem : OwnedRecord() {
    @Column(name = "title", nullable = false)
    var title: String = ""

    @Column(name = "category", length = 50)
    var category: String? = null
}

@Entity
@Table(name = "tasks")
class Task : OwnedRecord() {
    @Column(name = "title", nullable = false)
    var title: String = ""

    @Column(name = "category", length = 50)
    var category: String? = null

    @Column(name = "date", nullable = false)
    var date: LocalDate = LocalDate.ofEpochDay(0)

    @Column(name = "completed", nullable = false, columnDefinition = "tinyint")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var completed: Boolean = false

    @Column(name = "memo", columnDefinition = "text")
    var memo: String? = null

    @Column(name = "subItemId")
    var subItemId: Int? = null

    @Column(name = "parentTaskId")
    var parentTaskId: Int? = null

    @Column(name = "position", nullable = false)
    var position: Int = 0

    @Column(name = "isChore", nullable = false, columnDefinition = "tinyint")
    @get:JsonProperty("isChore")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var isChore: Boolean = false

    @Column(name = "highPriority", nullable = false, columnDefinition = "tinyint")
    @JdbcTypeCode(SqlTypes.TINYINT)
    var highPriority: Boolean = false

    @Column(name = "top3Order")
    var top3Order: Byte? = null

    @Column(name = "recurringId")
    var recurringId: Int? = null

    @Column(name = "weekItemId")
    var weekItemId: Int? = null

    @Column(name = "periodItemId")
    var periodItemId: Int? = null

    @Column(name = "startTime", length = 5)
    var startTime: String? = null

    @Column(name = "endTime", length = 5)
    var endTime: String? = null

    @Column(name = "updatedAt", nullable = false, columnDefinition = "datetime(6)")
    @get:JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    var updatedAt: LocalDateTime = createdAt

    @PreUpdate
    fun markUpdated() {
        updatedAt = utcNow()
    }
}

@Entity
@Table(name = "week_items")
class WeekItem : OwnedRecord() {
    @Column(name = "weekStart", nullable = false)
    var weekStart: LocalDate = LocalDate.ofEpochDay(0)

    @Column(name = "title", nullable = false)
    var title: String = ""

    @Column(name = "category", length = 50)
    var category: String? = null

    @Column(name = "days", length = 20)
    var days: String? = null
}

@Entity
@Table(name = "users")
class User : Record() {
    @Column(name = "email", nullable = false, unique = true)
    var email: String = ""

    @Column(name = "password", nullable = false)
    @get:JsonIgnore
    var password: String = ""

    @Column(name = "name", nullable = false)
    var name: String = ""

    @Column(name = "updatedAt", nullable = false, columnDefinition = "datetime(6)")
    @get:JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    var updatedAt: LocalDateTime = createdAt

    @PreUpdate
    fun markUpdated() {
        updatedAt = utcNow()
    }
}
