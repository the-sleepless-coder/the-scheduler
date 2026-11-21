package scheduler

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe

class HttpContractTest : UnitTest({
    given("an invalid task payload") {
        `when`("its title and date are validated") {
            then("both legacy messages are returned in field order") {
                // arrange
                val input = Input(mapOf("title" to 0, "date" to "tomorrow"))
                // act
                input.string("title", max = 200)
                input.date("date", message = "날짜는 YYYY-MM-DD 형식이어야 합니다.")
                val error = shouldThrow<ApiError> { input.validate() }
                // assert
                error.detail shouldBe listOf(
                    "title must be shorter than or equal to 200 characters",
                    "title must be a string",
                    "날짜는 YYYY-MM-DD 형식이어야 합니다.",
                )
            }
        }
    }
})
