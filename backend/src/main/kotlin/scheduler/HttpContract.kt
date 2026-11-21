package scheduler

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import java.time.LocalDate
import java.time.YearMonth

class ApiError(val status: HttpStatus, val detail: Any) : RuntimeException()

fun badRequest(message: String): Nothing = throw ApiError(HttpStatus.BAD_REQUEST, message)
fun unauthorized(message: String = "Unauthorized"): Nothing = throw ApiError(HttpStatus.UNAUTHORIZED, message)
fun notFound(message: String): Nothing = throw ApiError(HttpStatus.NOT_FOUND, message)
fun conflict(message: String): Nothing = throw ApiError(HttpStatus.CONFLICT, message)
fun ok() = mapOf("ok" to true)

@RestControllerAdvice
class HttpErrors {
    @ExceptionHandler(ApiError::class)
    fun api(error: ApiError): ResponseEntity<Map<String, Any>> {
        val body = mutableMapOf("statusCode" to error.status.value(), "message" to error.detail)
        if (error.detail != "Unauthorized") body["error"] = error.status.reasonPhrase
        return ResponseEntity.status(error.status).body(body)
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun invalidNumber() = api(ApiError(HttpStatus.BAD_REQUEST, "Validation failed (numeric string is expected)"))

    @ExceptionHandler(HttpMessageNotReadableException::class, MissingServletRequestParameterException::class)
    fun invalidRequest(error: Exception) = api(ApiError(HttpStatus.BAD_REQUEST,
        if (error is MissingServletRequestParameterException && error.parameterName == "memoItemId")
            "Validation failed (numeric string is expected)" else "Bad Request"))
}

typealias JsonBody = Map<String, Any?>

/** Validate only whitelisted fields and retain field presence for PATCH. */
class Input(private val body: JsonBody) {
    private val errors = mutableListOf<String>()

    fun has(key: String) = body.containsKey(key)

    fun string(key: String, max: Int? = null, min: Int? = null, optional: Boolean = false): String? {
        val value = body[key]
        if (value == null && optional) return null
        if (max != null && (value !is String || value.codePointCount(0, value.length) > max))
            errors += "$key must be shorter than or equal to $max characters"
        if (min != null && (value !is String || value.codePointCount(0, value.length) < min))
            errors += when (key) {
                "password", "newPassword" -> "비밀번호는 8자 이상이어야 합니다."
                "name" -> "name must be longer than or equal to 1 characters"
                else -> "$key must be longer than or equal to $min characters"
            }
        if (value !is String) errors += "$key must be a string"
        return value as? String
    }

    fun pattern(key: String, regex: Regex, optional: Boolean = false, message: String? = null): String? {
        val value = body[key]
        if (value == null && optional) return null
        if (value !is String || !regex.matches(value)) errors +=
            message ?: "$key must match /${regex.pattern}/ regular expression"
        return value as? String
    }

    fun date(key: String, optional: Boolean = false, message: String? = null): LocalDate? {
        val value = pattern(key, DATE, optional, message) ?: return null
        if (!DATE.matches(value)) return null
        return try {
            LocalDate.parse(value)
        } catch (_: java.time.DateTimeException) {
            errors += message ?: "$key must be a valid date"
            null
        }
    }

    fun integer(key: String, optional: Boolean = false, min: Int? = null, max: Int? = null): Int? {
        val value = body[key]
        if (value == null && optional) return null
        val number = (value as? Number)?.toDouble()?.takeIf {
            it in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble() && it % 1 == 0.0
        }?.toInt()
        if (max != null && (number == null || number > max)) errors += "$key must not be greater than $max"
        if (min != null && (number == null || number < min)) errors += "$key must not be less than $min"
        if (number == null) errors += "$key must be an integer number"
        return number
    }

    fun boolean(key: String): Boolean? {
        val value = body[key] ?: return null
        if (value !is Boolean) errors += "$key must be a boolean value"
        return value as? Boolean
    }

    fun ids(key: String): Set<Int> {
        val value = body[key] ?: return emptySet()
        if (value !is List<*>) errors += "$key must be an array"
        val values = (value as? List<*>) ?: return emptySet()
        val ids = values.mapNotNull {
            (it as? Number)?.toDouble()?.takeIf { n ->
                n in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble() && n % 1 == 0.0
            }?.toInt()
        }
        if (ids.size != values.size) errors += "each value in $key must be an integer number"
        return ids.toSet()
    }

    fun validate() {
        if (errors.isNotEmpty()) throw ApiError(HttpStatus.BAD_REQUEST, errors.toList())
    }

    companion object {
        val DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")
        val MONTH = Regex("""^\d{4}-\d{2}$""")
        val TOPIC_KEY = Regex("""^\d{4}-\d{2}(-\d{2})?$""")
        val TIME = Regex("""^\d{2}:\d{2}$""")
        val DAYS = Regex("""^[0-6](,[0-6]){0,6}$""")
        val EMAIL = Regex("""^[^\s@]+@[^\s@]+\.[^\s@]+$""")
    }
}

fun queryMonth(month: String): YearMonth = try {
    YearMonth.parse(month)
} catch (_: java.time.DateTimeException) {
    badRequest("month must be a valid month")
}
