package scheduler

import com.nimbusds.jose.JOSEException
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.crypto.MACVerifier
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.bcrypt.BCrypt
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.json.JsonMapper
import java.text.ParseException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

data class Account(val id: Int, val email: String)

@Component
class Tokens(@Value("\${scheduler.jwt-secret}") secret: String) {
    private val key = secret.toByteArray().let { it.copyOf(maxOf(32, it.size)) }

    fun issue(user: User): String {
        val now = Instant.now()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), JWTClaimsSet.Builder()
            .claim("sub", user.id)
            .claim("email", user.email)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plus(7, ChronoUnit.DAYS)))
            .build())
        jwt.sign(MACSigner(key))
        return jwt.serialize()
    }

    fun read(token: String): Account? = try {
        val jwt = SignedJWT.parse(token)
        if (jwt.header.algorithm != JWSAlgorithm.HS256 || !jwt.verify(MACVerifier(key))) null
        else {
            val claims = jwt.payload.toJSONObject()
            val id = (claims?.get("sub") as? Number)?.toString()?.toIntOrNull()
            val email = claims?.get("email") as? String
            val now = Instant.now().epochSecond
            val exp = (claims?.get("exp") as? Number)?.toLong()
            val nbf = (claims?.get("nbf") as? Number)?.toLong()
            if (id == null || email == null || exp == null || exp <= now || (nbf != null && nbf > now))
                null else Account(id, email)
        }
    } catch (_: ParseException) {
        null
    } catch (_: JOSEException) {
        null
    }
}

@Configuration
class Security {
    @Bean
    fun apiSecurity(http: HttpSecurity, tokens: Tokens, json: JsonMapper): SecurityFilterChain {
        val publicPaths = arrayOf("/api/auth/register", "/api/auth/login")
        val cors = CorsConfiguration().apply {
            allowedOriginPatterns = listOf("*")
            allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            allowedHeaders = listOf("*")
            allowCredentials = true
        }
        val corsSource = UrlBasedCorsConfigurationSource().apply { registerCorsConfiguration("/**", cors) }
        val jwtFilter = object : OncePerRequestFilter() {
            override fun shouldNotFilter(request: HttpServletRequest): Boolean =
                request.method == "POST" && request.servletPath in publicPaths

            override fun doFilterInternal(
                request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain,
            ) {
                val token = request.getHeader("Authorization")?.takeIf { it.startsWith("Bearer ") }
                    ?.removePrefix("Bearer ")
                if (!token.isNullOrEmpty()) {
                    val account = tokens.read(token)
                    if (account == null) request.setAttribute("invalidToken", true)
                    else SecurityContextHolder.getContext().authentication =
                        UsernamePasswordAuthenticationToken.authenticated(account, null, emptyList())
                }
                chain.doFilter(request, response)
            }
        }
        return http.csrf { it.disable() }
            .cors { it.configurationSource(corsSource) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it.requestMatchers(HttpMethod.POST, *publicPaths).permitAll()
                    .anyRequest().authenticated()
            }
            .exceptionHandling {
                it.authenticationEntryPoint { request, response, _ ->
                    response.status = 401
                    response.contentType = "application/json"
                    response.characterEncoding = "UTF-8"
                    val message = if (request.getAttribute("invalidToken") == true)
                        "토큰이 유효하지 않습니다." else "로그인이 필요합니다."
                    json.writeValue(response.outputStream, mapOf(
                        "message" to message, "error" to "Unauthorized", "statusCode" to 401,
                    ))
                }
            }
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter::class.java)
            .build()
    }
}

@RestController
@RequestMapping("/api/auth")
@Transactional
class AuthController(private val records: Records, private val tokens: Tokens) {
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    fun register(@RequestBody body: JsonBody): Map<String, Any> {
        val input = Input(body)
        val email = input.pattern("email", Input.EMAIL, message = "email must be an email")
        val password = input.string("password", min = 8)
        val name = input.string("name", max = 30, min = 1)
        input.validate()
        if (records.userByEmail(email!!) != null) conflict("이미 가입된 이메일입니다.")
        val user = try {
            records.insert(User().apply {
                this.email = email
                this.password = hash(password!!)
                this.name = name!!
            })
        } catch (_: DataIntegrityViolationException) {
            conflict("이미 가입된 이메일입니다.")
        }
        return session(user)
    }

    @PostMapping("/login")
    fun login(@RequestBody body: JsonBody): Map<String, Any> {
        val input = Input(body)
        val email = input.pattern("email", Input.EMAIL, message = "email must be an email")
        val password = input.string("password")
        input.validate()
        val user = records.userByEmail(email!!)
        if (user == null || !matches(password!!, user.password))
            unauthorized("이메일 또는 비밀번호가 올바르지 않습니다.")
        return session(user)
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal account: Account) = records.activeUser(account.id) ?: unauthorized()

    @PostMapping("/change-password")
    fun changePassword(@AuthenticationPrincipal account: Account, @RequestBody body: JsonBody): Map<String, Boolean> {
        val input = Input(body)
        val current = input.string("currentPassword")
        val next = input.string("newPassword", min = 8)
        input.validate()
        records.lockUser(account.id)
        val user = records.activeUser(account.id)
        if (user == null || !matches(current!!, user.password)) unauthorized("현재 비밀번호가 올바르지 않습니다.")
        user.password = hash(next!!)
        return ok()
    }

    private fun session(user: User) = mapOf(
        "accessToken" to tokens.issue(user),
        "user" to mapOf("id" to user.id, "email" to user.email, "name" to user.name),
    )

    // bcryptjs hashes the first 72 UTF-8 bytes, including passwords longer than 72 bytes.
    private fun bcryptBytes(password: String) = password.toByteArray().let { it.copyOf(minOf(it.size, 72)) }
    private fun hash(password: String) = BCrypt.hashpw(bcryptBytes(password), BCrypt.gensalt(10))
    private fun matches(password: String, hash: String) = try {
        BCrypt.checkpw(bcryptBytes(password), hash)
    } catch (_: IllegalArgumentException) {
        false
    }
}
