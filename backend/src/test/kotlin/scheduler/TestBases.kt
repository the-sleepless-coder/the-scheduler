package scheduler

import io.kotest.core.spec.style.BehaviorSpec
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.http.HttpMethod
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import org.testcontainers.mysql.MySQLContainer
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

abstract class UnitTest(body: BehaviorSpec.() -> Unit) : BehaviorSpec(body)

abstract class IntegrationTest : BehaviorSpec() {
    private lateinit var mysql: MySQLContainer
    protected lateinit var applicationContext: ConfigurableApplicationContext
    protected lateinit var jdbc: JdbcTemplate
    private val tables = listOf("tasks", "recurring_items", "week_items", "period_items", "memo_items",
        "memo_item_logs", "month_memos", "mind_topics", "hidden_folders", "users")

    init {
        beforeSpec {
            mysql = MySQLContainer("mysql:8.0")
                .withDatabaseName("scheduler_test")
                .withUsername("scheduler_test")
                .withPassword("scheduler-test-password")
                .withInitScript("db/migration/V1__legacy_schema.sql")
            mysql.start()
            applicationContext = SpringApplicationBuilder(SchedulerApplication::class.java).run(
                "--server.port=0",
                "--spring.datasource.url=${mysql.jdbcUrl}",
                "--spring.datasource.username=${mysql.username}",
                "--spring.datasource.password=${mysql.password}",
                "--spring.flyway.baseline-on-migrate=true",
                "--scheduler.jwt-secret=$TEST_SECRET",
            )
            jdbc = applicationContext.getBean(JdbcTemplate::class.java)
        }
        beforeEach { tables.forEach { jdbc.update("delete from $it") } }
        afterSpec {
            try {
                if (::applicationContext.isInitialized) applicationContext.close()
            } finally {
                if (::mysql.isInitialized) mysql.stop()
            }
        }
    }

    companion object {
        const val TEST_SECRET = "local-legacy-test-secret"
    }
}

abstract class E2ETest : IntegrationTest() {
    protected lateinit var mvc: MockMvc
    protected lateinit var json: JsonMapper

    init {
        beforeSpec {
            mvc = MockMvcBuilders.webAppContextSetup(applicationContext as WebApplicationContext)
                .apply<DefaultMockMvcBuilder>(springSecurity())
                .build()
            json = applicationContext.getBean(JsonMapper::class.java)
        }
    }

    protected fun call(method: String, path: String, status: Int, token: String? = null,
        body: String? = null): JsonNode {
        val request = request(HttpMethod.valueOf(method), "/api$path")
        token?.let { request.header("Authorization", "Bearer $it") }
        body?.let { request.contentType("application/json").content(it) }
        val response = mvc.perform(request).andReturn().response
        val content = response.getContentAsString(Charsets.UTF_8)
        check(response.status == status) { "$method $path returned ${response.status}, expected $status" }
        return json.readTree(content)
    }

    protected fun account(email: String): TestAccount {
        val response = call("POST", "/auth/register", 201,
            body = """{"email":"$email","name":"Test user","password":"strong-fixture-password"}""")
        return TestAccount(response["user"]["id"].intValue(), response["accessToken"].asString())
    }

    protected fun memo(token: String, name: String, parent: Int? = null, category: String = "Study"): Int =
        call("POST", "/memo-items", 201, token,
            """{"month":"2026-11","category":"$category","text":"$name","parentId":$parent}""")["id"].intValue()

    protected fun parsed(body: String) = json.readTree(body)
}

data class TestAccount(val id: Int, val token: String)
