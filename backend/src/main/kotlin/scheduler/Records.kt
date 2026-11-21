package scheduler

import jakarta.persistence.EntityManager
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.Repository as SpringDataRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

interface UserRepository : SpringDataRepository<User, Int> {
    fun findByEmailAndDeletedAtIsNull(email: String): User?
    fun findByIdAndDeletedAtIsNull(id: Int): User?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id and u.deletedAt is null")
    fun lockActive(@Param("id") id: Int): User?
}

@Repository
class Records(val entityManager: EntityManager, private val users: UserRepository) {
    fun <T : OwnedRecord> query(
        type: Class<T>, userId: Int, condition: String, parameters: Array<out Pair<String, Any>>,
        order: String, includeDeleted: Boolean,
    ): List<T> {
        val active = if (includeDeleted) "" else "and r.deletedAt is null"
        return entityManager.createQuery(
            "select r from ${type.simpleName} r where r.userId = :owner $active and ($condition) order by $order",
            type,
        ).apply {
            setParameter("owner", userId)
            parameters.forEach { (name, value) -> setParameter(name, value) }
        }.resultList
    }

    fun <T : Record> insert(record: T, userId: Int? = null): T {
        if (record is OwnedRecord) record.userId = requireNotNull(userId)
        entityManager.persist(record)
        return record
    }

    fun lockUser(userId: Int) {
        if (users.lockActive(userId) == null) unauthorized()
    }

    fun userByEmail(email: String): User? = users.findByEmailAndDeletedAtIsNull(email)

    fun activeUser(id: Int): User? = users.findByIdAndDeletedAtIsNull(id)

    fun <T : Record> updated(record: T): T {
        entityManager.flush()
        return record
    }

    fun delete(record: Record?) {
        record?.deletedAt = utcNow()
    }
}

internal inline fun <reified T : OwnedRecord> Records.list(
    userId: Int,
    condition: String = "1 = 1",
    vararg parameters: Pair<String, Any>,
    order: String = "r.id",
    includeDeleted: Boolean = false,
): List<T> = query(T::class.java, userId, condition, parameters, order, includeDeleted)

internal inline fun <reified T : OwnedRecord> Records.own(userId: Int, id: Int): T? =
    list<T>(userId, "r.id = :id", "id" to id).firstOrNull()
