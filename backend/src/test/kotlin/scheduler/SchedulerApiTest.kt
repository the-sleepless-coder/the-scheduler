package scheduler

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.JWSObject
import com.nimbusds.jose.Payload
import com.nimbusds.jose.crypto.MACSigner
import io.kotest.matchers.shouldBe
import java.time.Instant

class SchedulerApiTest : E2ETest() {
    init {
        given("an existing TypeORM database and a bcryptjs password") {
            `when`("the user presents a legacy token or signs in") {
                then("legacy rows survive Flyway baselining and the complete API responses keep their shape") {
                    // arrange
                    val email = "legacy@example.com"
                    val hash = "\$2b\$10\$fJbn9yG6XVE.NN/vTJOTD.HHGkvV5ficBF.u5Mu6tL.xi.ybhqlMm"
                    jdbc.update("""insert into users (id,email,password,name,createdAt,updatedAt)
                        values (101,?,?,'Legacy','2026-11-02 10:20:30.123','2026-11-03 10:20:30.456')""", email, hash)
                    jdbc.update("""insert into tasks (id,userId,title,category,date,isChore,startTime,createdAt,updatedAt)
                        values (102,101,'Legacy task','Schedule','2026-11-03',1,'09:05',
                        '2026-11-02 10:20:30.123','2026-11-03 10:20:30.456')""")
                    val exp = Instant.now().plusSeconds(3600).epochSecond
                    val legacy = JWSObject(JWSHeader(JWSAlgorithm.HS256), Payload(
                        """{"sub":101,"email":"$email","exp":$exp}""",
                    )).also { it.sign(MACSigner(TEST_SECRET.toByteArray().copyOf(32))) }.serialize()

                    // act
                    val me = call("GET", "/auth/me", 200, legacy)
                    val login = call("POST", "/auth/login", 200, body =
                        """{"email":"$email","password":"legacy-password"}""")
                    val tasks = call("GET", "/tasks?date=2026-11-03", 200, login["accessToken"].asString())

                    // assert
                    jdbc.queryForObject("select type from flyway_schema_history where version='1'", String::class.java) shouldBe "BASELINE"
                    me shouldBe parsed("""{"id":101,"email":"$email","name":"Legacy",
                        "createdAt":"2026-11-02T10:20:30.123Z","updatedAt":"2026-11-03T10:20:30.456Z","deletedAt":null}""")
                    login["user"] shouldBe parsed("""{"id":101,"email":"$email","name":"Legacy"}""")
                    val claims = JWSObject.parse(login["accessToken"].asString()).payload.toJSONObject()
                    claims["sub"].toString() shouldBe "101"
                    ((claims["exp"] as Number).toLong() - (claims["iat"] as Number).toLong()) shouldBe 604800L
                    tasks shouldBe parsed("""[{"id":102,"userId":101,"title":"Legacy task","category":"Schedule",
                        "date":"2026-11-03","completed":false,"memo":null,"subItemId":null,"parentTaskId":null,
                        "position":0,"isChore":true,"highPriority":false,"top3Order":null,"recurringId":null,
                        "weekItemId":null,"periodItemId":null,"startTime":"09:05","endTime":null,
                        "createdAt":"2026-11-02T10:20:30.123Z","updatedAt":"2026-11-03T10:20:30.456Z","deletedAt":null}]""")
                }
            }
        }

        given("authentication failures and password changes") {
            `when`("requests present missing, invalid, or outdated credentials") {
                then("errors retain their status and legacy message and only the new password works") {
                    val user = account("owner@example.com")
                    call("GET", "/auth/me", 401) shouldBe parsed(
                        """{"statusCode":401,"message":"로그인이 필요합니다.","error":"Unauthorized"}""")
                    call("GET", "/auth/me", 401, "invalid")["message"].asString() shouldBe "토큰이 유효하지 않습니다."
                    call("POST", "/auth/register", 409, body =
                        """{"email":"owner@example.com","name":"Duplicate","password":"some-long-password"}"""
                    )["message"].asString() shouldBe "이미 가입된 이메일입니다."
                    call("POST", "/auth/change-password", 401, user.token, """{"currentPassword":"wrong","newPassword":"new-long-password"}"""
                    )["message"].asString() shouldBe "현재 비밀번호가 올바르지 않습니다."
                    call("POST", "/auth/change-password", 200, user.token,
                        """{"currentPassword":"strong-fixture-password","newPassword":"new-long-password"}""") shouldBe parsed("""{"ok":true}""")
                    call("POST", "/auth/login", 401, body =
                        """{"email":"owner@example.com","password":"strong-fixture-password"}""")
                    call("POST", "/auth/login", 200, body =
                        """{"email":"owner@example.com","password":"new-long-password"}""")
                }
            }
        }

        given("two users and a task with nullable and non-nullable fields") {
            `when`("one user attempts foreign reads, writes and links, and the owner patches the task") {
                then("the API scopes access and only clears explicitly nullable fields") {
                    val owner = account("owner@example.com")
                    val other = account("other@example.com")
                    val memo = memo(owner.token, "Private item")
                    val created = call("POST", "/tasks", 201, owner.token,
                        """{"title":"Private task","date":"2026-11-04","category":"Schedule","startTime":"09:30"}""")
                    val id = created["id"].intValue()
                    call("GET", "/tasks?date=2026-11-04", 200, other.token) shouldBe parsed("[]")
                    call("PATCH", "/tasks/$id", 404, other.token, """{"title":"Foreign change"}""")
                    call("DELETE", "/tasks/$id", 404, other.token)
                    call("PATCH", "/memo-items/$memo", 404, other.token, """{"completed":true}""")
                    call("GET", "/memo-items?month=2026-11", 200, other.token) shouldBe parsed("[]")
                    call("POST", "/memo-items", 404, other.token,
                        """{"month":"2026-11","category":"Study","text":"Foreign link","parentId":$memo}""")

                    val edited = call("PATCH", "/tasks/$id", 200, owner.token,
                        """{"memo":"keep this","highPriority":true,"top3Order":3}""")
                    edited["category"].asString() shouldBe "Schedule"
                    edited["isChore"].booleanValue() shouldBe true
                    val cleared = call("PATCH", "/tasks/$id", 200, owner.token,
                        """{"category":null,"startTime":null,"top3Order":null}""")
                    cleared["title"].asString() shouldBe "Private task"
                    cleared["memo"].asString() shouldBe "keep this"
                    cleared["category"].isNull shouldBe true
                    cleared["startTime"].isNull shouldBe true
                    cleared["top3Order"].isNull shouldBe true
                    cleared["highPriority"].booleanValue() shouldBe true
                    call("DELETE", "/tasks/$id", 200, owner.token) shouldBe parsed("""{"ok":true}""")
                }
            }
        }

        given("daily, weekly and period definitions created after the query start") {
            `when`("a range is loaded twice and a generated task is then deleted") {
                then("date bounds and weekdays apply and the deleted occurrence stays deleted") {
                    val owner = account("calendar@example.com")
                    val token = owner.token
                    val daily = call("POST", "/recurring", 201, token, """{"title":"Daily"}""")["id"].intValue()
                    val week = call("POST", "/week-items", 201, token,
                        """{"weekStart":"2026-11-02","title":"Weekly","days":"0,2,4"}""")["id"].intValue()
                    val period = call("POST", "/period-items", 201, token,
                        """{"startDate":"2026-11-02","endDate":"2026-11-05","title":"Period"}""")["id"].intValue()
                    jdbc.update("update recurring_items set createdAt='2026-11-03' where id=?", daily)
                    jdbc.update("update week_items set createdAt='2026-11-03' where id=?", week)
                    jdbc.update("update period_items set createdAt='2026-11-04' where id=?", period)
                    val range = "/tasks/range?from=2026-11-02&to=2026-11-06"
                    val first = call("GET", range, 200, token)
                    val dates = first.values().groupBy { it["title"].asString() }.mapValues { (_, rows) ->
                        rows.map { it["date"].asString() }
                    }
                    dates shouldBe mapOf(
                        "Daily" to listOf("2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"),
                        "Weekly" to listOf("2026-11-04", "2026-11-06"),
                        "Period" to listOf("2026-11-04", "2026-11-05"),
                    )
                    call("GET", range, 200, token) shouldBe first
                    val removed = first[0]["id"].intValue()
                    call("DELETE", "/tasks/$removed", 200, token)
                    call("GET", range, 200, token).values().map { it["id"].intValue() } shouldBe
                        first.values().drop(1).map { it["id"].intValue() }
                    jdbc.queryForObject("select count(*) from tasks where id=? and deletedAt is not null",
                        Int::class.java, removed) shouldBe 1
                }
            }
        }

        given("a memo hierarchy, a task and a folder topic") {
            `when`("the task is completed and the folder is renamed, hidden and copied") {
                then("completion propagates, names synchronize and the destination has independent parent IDs") {
                    val user = account("memo@example.com")
                    val token = user.token
                    val parent = memo(token, "Parent")
                    val child = memo(token, "Child", parent)
                    val topic = call("POST", "/mind-topics", 201, token,
                        """{"month":"2026-11","name":"Study"}""")["id"].intValue()
                    call("PATCH", "/mind-topics/$topic", 200, token, """{"isFolder":true}""")["isFolder"].booleanValue() shouldBe true
                    val task = call("POST", "/tasks", 201, token,
                        """{"title":"Parent","date":"2026-11-05","category":"Study"}""")["id"].intValue()

                    call("PATCH", "/tasks/$task", 200, token, """{"subItemId":$child,"completed":true}""")
                    val november = "/memo-items?month=2026-11"
                    call("GET", november, 200, token).values().map { it["completed"].booleanValue() } shouldBe listOf(true, true)
                    call("PATCH", "/memo-items/$child", 200, token, """{"completed":false,"content":"child details"}""")
                    call("GET", november, 200, token)[0]["completed"].booleanValue() shouldBe false
                    call("POST", "/memo-items/rename-folder", 201, token,
                        """{"month":"2026-11","from":"Study","to":"Projects"}""")
                    call("GET", "/tasks?date=2026-11-05", 200, token)[0]["category"].asString() shouldBe "Projects"
                    call("GET", "/mind-topics?month=2026-11", 200, token)[0]["name"].asString() shouldBe "Projects"
                    repeat(2) {
                        call("POST", "/memo-items/delete-folder", 201, token,
                            """{"month":"2026-11","category":"Projects"}""") shouldBe parsed("""{"ok":true}""")
                    }
                    call("GET", "/memo-items/hidden-folders?month=2026-11", 200, token) shouldBe parsed("""["Projects"]""")
                    call("GET", "/mind-topics?month=2026-11", 200, token)[0]["isFolder"].booleanValue() shouldBe false
                    val selected = """{"month":"2026-11","itemIds":[$parent,$child],"excludeCompleted":true}"""
                    call("POST", "/memo-items/copy-to-next-month", 201, token, selected) shouldBe
                        parsed("""{"ok":true,"copied":2,"nextMonth":"2026-12"}""")
                    call("POST", "/memo-items/copy-to-next-month", 201, token, selected) shouldBe
                        parsed("""{"ok":true,"copied":0,"nextMonth":"2026-12"}""")
                    val copies = call("GET", "/memo-items?month=2026-12", 200, token)
                    val destinationParent = copies[0]["id"].intValue()
                    (destinationParent != parent) shouldBe true
                    copies[1]["parentId"].intValue() shouldBe destinationParent
                    copies[1]["content"].asString() shouldBe "child details"
                    copies[1]["category"].asString() shouldBe "Projects"
                }
            }
        }

        given("a user's monthly memos and activity logs") {
            `when`("the user saves multiple notes and lists distinct activity labels and units") {
                then("ordering, soft deletion and JSON results remain compatible") {
                    val token = account("log@example.com").token
                    val item = memo(token, "Practice")
                    val note = """{"date":"2026-11-05","category":"Study","content":"entry"}"""
                    val noteId = call("PUT", "/month-memos", 200, token, note)["id"].intValue()
                    call("PUT", "/month-memos", 200, token, note)
                    call("GET", "/month-memos?month=2026-11", 200, token).size() shouldBe 2
                    call("DELETE", "/month-memos/$noteId", 200, token) shouldBe parsed("""{"ok":true}""")
                    call("GET", "/month-memos?month=2026-11", 200, token).size() shouldBe 1

                    val a = call("POST", "/memo-item-logs", 201, token,
                        """{"memoItemId":$item,"date":"2026-11-05","label":"Reading","count":10,"unit":"pages"}""")["id"].intValue()
                    val b = call("POST", "/memo-item-logs", 201, token,
                        """{"memoItemId":$item,"date":"2026-11-06","label":"Coding","count":20,"unit":"minutes"}""")["id"].intValue()
                    jdbc.update("update memo_item_logs set createdAt='2026-11-05' where id=?", a)
                    jdbc.update("update memo_item_logs set createdAt='2026-11-06' where id=?", b)
                    call("GET", "/memo-item-logs/labels?memoItemId=$item", 200, token) shouldBe parsed("""["Coding","Reading"]""")
                    call("GET", "/memo-item-logs/units?memoItemId=$item", 200, token) shouldBe parsed("""["minutes","pages"]""")
                    call("GET", "/memo-item-logs?memoItemId=$item&from=2026-11-05&to=2026-11-06", 200, token)[0]["id"].intValue() shouldBe b
                    call("DELETE", "/memo-item-logs/$b", 200, token) shouldBe parsed("""{"ok":true}""")
                    call("GET", "/memo-item-logs/units?memoItemId=$item", 200, token) shouldBe parsed("""["pages"]""")
                }
            }
        }
    }
}
